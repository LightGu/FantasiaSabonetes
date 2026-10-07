-- Fantasia Saboaria — estrutura inicial do banco
-- Execute este arquivo uma vez no SQL Editor do Supabase.

create extension if not exists pgcrypto;

-- Tipos usados pelo sistema
create type public.user_role as enum ('admin');
create type public.order_status as enum (
  'awaiting_payment',
  'paid',
  'preparing',
  'ready_for_pickup',
  'completed',
  'cancelled'
);
create type public.payment_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'refunded'
);
create type public.fulfillment_method as enum ('pickup', 'local_delivery');

-- Apenas usuários administrativos usam Supabase Auth.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role public.user_role not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  short_description text not null default '',
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  aroma_tags text[] not null default '{}',
  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Cliente não precisa criar conta: nome e WhatsApp identificam a compra.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  phone text not null,
  normalized_phone text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  public_token uuid not null default gen_random_uuid() unique,
  customer_id uuid not null references public.customers(id),
  status public.order_status not null default 'awaiting_payment',
  fulfillment public.fulfillment_method not null default 'pickup',
  delivery_address text,
  customer_note text,
  subtotal numeric(10,2) not null check (subtotal >= 0),
  delivery_fee numeric(10,2) not null default 0 check (delivery_fee >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  total numeric(10,2) not null check (total >= 0),
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    fulfillment <> 'local_delivery'
    or nullif(btrim(delivery_address), '') is not null
  )
);

-- Nome e preço ficam registrados como eram no momento da compra.
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(10,2) generated always as (unit_price * quantity) stored,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  provider text not null default 'mercado_pago',
  provider_payment_id text,
  provider_order_id text,
  status public.payment_status not null default 'pending',
  amount numeric(10,2) not null check (amount >= 0),
  pix_copy_paste text,
  pix_qr_code_base64 text,
  expires_at timestamptz,
  approved_at timestamptz,
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

-- Auditoria e idempotência: o mesmo webhook não é processado duas vezes.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payment_id uuid references public.payments(id) on delete set null,
  payload jsonb not null,
  processed boolean not null default false,
  processing_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create index products_active_sort_idx
  on public.products (is_active, sort_order, created_at desc);
create index orders_customer_idx on public.orders (customer_id);
create index orders_status_created_idx on public.orders (status, created_at desc);
create index order_items_order_idx on public.order_items (order_id);
create index payments_order_idx on public.payments (order_id);

-- Atualiza updated_at automaticamente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers
for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
for each row execute function public.set_updated_at();

-- Verificação reutilizada pelas políticas RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Criação pública e segura de pedido.
-- items deve ter o formato:
-- [{"product_id":"UUID", "quantity":2}, ...]
create or replace function public.create_order(
  customer_name text,
  customer_phone text,
  items jsonb,
  fulfillment_method public.fulfillment_method default 'pickup',
  address text default null,
  note text default null
)
returns table (
  order_id uuid,
  order_public_token uuid,
  order_number bigint,
  order_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_phone text;
  v_subtotal numeric(10,2);
begin
  if char_length(btrim(customer_name)) < 2 then
    raise exception 'Nome inválido';
  end if;

  v_phone := regexp_replace(customer_phone, '[^0-9]', '', 'g');
  if char_length(v_phone) < 10 or char_length(v_phone) > 13 then
    raise exception 'Telefone inválido';
  end if;

  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then
    raise exception 'O pedido precisa ter ao menos um produto';
  end if;

  if fulfillment_method = 'local_delivery' and nullif(btrim(address), '') is null then
    raise exception 'Informe o endereço para entrega local';
  end if;

  -- Rejeita quantidades inválidas, produtos inexistentes/inativos e falta de estoque.
  if exists (
    select 1
    from jsonb_to_recordset(items) as requested(product_id uuid, quantity integer)
    left join public.products p on p.id = requested.product_id
    where requested.quantity is null
       or requested.quantity <= 0
       or p.id is null
       or not p.is_active
       or p.stock < requested.quantity
  ) then
    raise exception 'Há um produto inválido, indisponível ou sem estoque';
  end if;

  -- IDs repetidos no JSON poderiam gerar totais inesperados.
  if (
    select count(*) <> count(distinct requested.product_id)
    from jsonb_to_recordset(items) as requested(product_id uuid, quantity integer)
  ) then
    raise exception 'Não repita o mesmo produto no pedido';
  end if;

  select coalesce(sum(p.price * requested.quantity), 0)::numeric(10,2)
  into v_subtotal
  from jsonb_to_recordset(items) as requested(product_id uuid, quantity integer)
  join public.products p on p.id = requested.product_id;

  insert into public.customers (name, phone, normalized_phone)
  values (btrim(customer_name), btrim(customer_phone), v_phone)
  on conflict (normalized_phone) do update
    set name = excluded.name,
        phone = excluded.phone,
        updated_at = now()
  returning id into v_customer_id;

  insert into public.orders (
    customer_id, fulfillment, delivery_address, customer_note,
    subtotal, delivery_fee, discount, total
  ) values (
    v_customer_id,
    fulfillment_method,
    nullif(btrim(address), ''),
    nullif(btrim(note), ''),
    v_subtotal,
    0,
    0,
    v_subtotal
  ) returning id into v_order_id;

  insert into public.order_items (
    order_id, product_id, product_name, unit_price, quantity
  )
  select v_order_id, p.id, p.name, p.price, requested.quantity
  from jsonb_to_recordset(items) as requested(product_id uuid, quantity integer)
  join public.products p on p.id = requested.product_id;

  return query
    select o.id, o.public_token, o.order_number, o.total
    from public.orders o
    where o.id = v_order_id;
end;
$$;

revoke all on function public.create_order(text, text, jsonb, public.fulfillment_method, text, text) from public;
grant execute on function public.create_order(text, text, jsonb, public.fulfillment_method, text, text)
  to anon, authenticated;

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

create policy "Public can view active products"
on public.products for select
to anon, authenticated
using (is_active or public.is_admin());

create policy "Admins manage products"
on public.products for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins view profiles"
on public.profiles for select
to authenticated
using (public.is_admin());

create policy "Admins manage customers"
on public.customers for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins manage orders"
on public.orders for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins manage order items"
on public.order_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins view payments"
on public.payments for select
to authenticated
using (public.is_admin());

create policy "Admins view payment events"
on public.payment_events for select
to authenticated
using (public.is_admin());

-- O frontend só recebe permissão direta de leitura do catálogo.
-- Pedidos são criados exclusivamente pela função create_order.
revoke all on public.profiles from anon, authenticated;
revoke all on public.customers from anon, authenticated;
revoke all on public.orders from anon, authenticated;
revoke all on public.order_items from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.payment_events from anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.profiles, public.customers, public.orders,
  public.order_items, public.payments, public.payment_events to authenticated;
grant insert, update, delete on public.customers, public.orders,
  public.order_items to authenticated;

-- Produtos iniciais (imagens serão ligadas quando conectarmos o site ao Storage).
insert into public.products
  (name, slug, short_description, description, price, stock, aroma_tags, is_featured, sort_order)
values
  ('Alecrim & Sálvia', 'alecrim-salvia', 'Herbal, fresco e restaurador.', 'Uma combinação verde e aromática para transformar o banho em um momento de renovação.', 18.00, 14, array['herbal','fresco'], true, 1),
  ('Manjericão & Alecrim', 'manjericao-alecrim', 'Vibrante, verde e revigorante.', 'Notas verdes de manjericão encontram o frescor marcante do alecrim.', 18.00, 9, array['verde','energizante'], false, 2),
  ('Lavanda & Alecrim', 'lavanda-alecrim', 'Floral, sereno e equilibrado.', 'O aroma reconfortante da lavanda ganha um toque fresco de alecrim.', 18.00, 12, array['floral','calmante'], true, 3),
  ('Camomila & Sálvia', 'camomila-salvia', 'Suave, delicado e acolhedor.', 'Uma mistura delicada, de perfume macio e herbal.', 18.00, 7, array['suave','herbal'], false, 4),
  ('Hortelã & Alecrim', 'hortela-alecrim', 'Refrescante, limpo e intenso.', 'Hortelã e alecrim se unem em um aroma vivo e refrescante.', 18.00, 16, array['fresco','revigorante'], true, 5),
  ('Eucalipto & Sálvia', 'eucalipto-salvia', 'Botânico, profundo e fresco.', 'Uma fragrância botânica que equilibra o eucalipto fresco e a sálvia.', 18.00, 5, array['botânico','intenso'], false, 6),
  ('Capim-limão & Alecrim', 'capim-limao-alecrim', 'Cítrico, leve e ensolarado.', 'O brilho cítrico do capim-limão encontra as notas verdes do alecrim.', 18.00, 10, array['cítrico','leve'], false, 7),
  ('Erva-doce & Alecrim', 'erva-doce-alecrim', 'Doce, herbal e confortável.', 'Um aroma delicadamente adocicado, envolvido pelo frescor do alecrim.', 18.00, 8, array['doce','confortável'], false, 8);

-- DEPOIS de criar seu usuário em Authentication > Users, rode separadamente:
-- insert into public.profiles (id, display_name)
-- values ('COLE-AQUI-O-UUID-DO-SEU-USUARIO', 'Seu nome');
