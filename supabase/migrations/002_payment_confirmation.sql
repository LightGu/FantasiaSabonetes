-- Confirma um pagamento uma única vez e baixa o estoque de forma atômica.
-- Execute depois de 001_initial_schema.sql.

create or replace function public.confirm_order_payment(
  target_order_id uuid,
  payment_provider text,
  external_payment_id text,
  external_order_id text,
  paid_amount numeric,
  provider_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_order public.orders%rowtype;
begin
  select * into current_order
  from public.orders
  where id = target_order_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if current_order.status in ('paid', 'preparing', 'ready_for_pickup', 'completed') then
    return false;
  end if;

  if current_order.status = 'cancelled' then
    raise exception 'Pedido cancelado';
  end if;

  if paid_amount <> current_order.total then
    raise exception 'Valor pago não corresponde ao pedido';
  end if;

  if exists (
    select 1
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = target_order_id and p.stock < oi.quantity
  ) then
    raise exception 'Estoque insuficiente ao confirmar o pagamento';
  end if;

  update public.products p
  set stock = p.stock - oi.quantity
  from public.order_items oi
  where oi.order_id = target_order_id and p.id = oi.product_id;

  insert into public.payments (
    order_id, provider, provider_payment_id, provider_order_id,
    status, amount, approved_at, raw_response
  ) values (
    target_order_id, payment_provider, external_payment_id,
    external_order_id, 'approved', paid_amount, now(), provider_payload
  )
  on conflict (provider, provider_payment_id) do update
  set status = 'approved',
      provider_order_id = excluded.provider_order_id,
      amount = excluded.amount,
      approved_at = coalesce(public.payments.approved_at, now()),
      raw_response = excluded.raw_response,
      updated_at = now();

  update public.orders
  set status = 'paid', paid_at = now()
  where id = target_order_id;

  return true;
end;
$$;

revoke all on function public.confirm_order_payment(uuid, text, text, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, text, text, text, numeric, jsonb)
  to service_role;

