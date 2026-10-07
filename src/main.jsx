import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowRight, Check, Leaf, LockKeyhole,
  Menu, Minus, PackageCheck, Pencil, Plus, Search, ShieldCheck, ShoppingBag,
  Sparkles, Trash2, Truck, X
} from 'lucide-react';
import './styles.css';

const seedProducts = [
  { id: 1, name: 'Alecrim & Sálvia', short: 'Herbal, fresco e restaurador.', description: 'Uma combinação verde e aromática para transformar o banho em um momento de renovação. O alecrim traz frescor, enquanto a sálvia completa a experiência com seu aroma herbal.', image: '/products/alecrim-salvia.jpg', notes: ['herbal', 'fresco'], stock: 14, price: 18, featured: true, active: true },
  { id: 2, name: 'Manjericão & Alecrim', short: 'Vibrante, verde e revigorante.', description: 'Notas verdes de manjericão encontram o frescor marcante do alecrim. Uma escolha energizante para começar o dia com leveza e disposição.', image: '/products/manjericao-alecrim.jpg', notes: ['verde', 'energizante'], stock: 9, price: 18, active: true },
  { id: 3, name: 'Lavanda & Alecrim', short: 'Floral, sereno e equilibrado.', description: 'O aroma reconfortante da lavanda ganha um toque fresco de alecrim. Ideal para um banho tranquilo no fim do dia.', image: '/products/lavanda-alecrim.jpg', notes: ['floral', 'calmante'], stock: 12, price: 18, featured: true, active: true },
  { id: 4, name: 'Camomila & Sálvia', short: 'Suave, delicado e acolhedor.', description: 'Uma mistura delicada, de perfume macio e herbal. Camomila e sálvia criam um banho acolhedor para desacelerar.', image: '/products/camomila-salvia.jpg', notes: ['suave', 'herbal'], stock: 7, price: 18, active: true },
  { id: 5, name: 'Hortelã & Alecrim', short: 'Refrescante, limpo e intenso.', description: 'Hortelã e alecrim se unem em um aroma vivo e refrescante. Perfeito para os dias quentes ou para aquele banho que desperta.', image: '/products/hortela-alecrim.jpg', notes: ['fresco', 'revigorante'], stock: 16, price: 18, featured: true, active: true },
  { id: 6, name: 'Eucalipto & Sálvia', short: 'Botânico, profundo e fresco.', description: 'Uma fragrância botânica de presença, equilibrando o eucalipto fresco com o perfil terroso e elegante da sálvia.', image: '/products/eucalipto-salvia.jpg', notes: ['botânico', 'intenso'], stock: 5, price: 18, active: true },
  { id: 7, name: 'Capim-limão & Alecrim', short: 'Cítrico, leve e ensolarado.', description: 'O brilho cítrico do capim-limão encontra as notas verdes do alecrim em uma combinação alegre, limpa e surpreendente.', image: '/products/capim-limao-alecrim.jpg', notes: ['cítrico', 'leve'], stock: 10, price: 18, active: true },
  { id: 8, name: 'Erva-doce & Alecrim', short: 'Doce, herbal e confortável.', description: 'Um aroma delicadamente adocicado, envolvido pelo frescor verde do alecrim. Uma combinação familiar e confortável.', image: '/products/erva-doce-alecrim.jpg', notes: ['doce', 'confortável'], stock: 8, price: 18, active: true }
];

const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const ADMIN_PATH = '/gestao-fantasia';

function App() {
  const [products, setProducts] = useState(() => load('mae-products', seedProducts));
  const [cart, setCart] = useState(() => load('mae-cart', []));
  const [view, setView] = useState('shop');
  const [selected, setSelected] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [admin, setAdmin] = useState(() => window.location.pathname === ADMIN_PATH);
  const [adminOpen, setAdminOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('todos');

  useEffect(() => localStorage.setItem('mae-products', JSON.stringify(products)), [products]);
  useEffect(() => localStorage.setItem('mae-cart', JSON.stringify(cart)), [cart]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { document.body.style.overflow = (cartOpen || selected || adminOpen || editing) ? 'hidden' : ''; }, [cartOpen, selected, adminOpen, editing]);

  const visible = products.filter(p => p.active && (filter === 'todos' || p.notes.includes(filter)) && p.name.toLowerCase().includes(query.toLowerCase()));
  const count = cart.reduce((a, i) => a + i.qty, 0);
  const subtotal = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const freeShipping = subtotal >= 90;

  const add = (product) => {
    setCart(c => c.some(i => i.id === product.id) ? c.map(i => i.id === product.id ? { ...i, qty: Math.min(i.qty + 1, product.stock) } : i) : [...c, { ...product, qty: 1 }]);
    setToast(`${product.name} foi para a sua sacola`);
  };
  const changeQty = (id, delta) => setCart(c => c.map(i => i.id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0));
  const go = (next) => { setView(next); setCartOpen(false); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return <div className="app">
    {admin && <div className="admin-strip"><span><ShieldCheck size={14}/> Modo administrador</span><button onClick={() => setAdminOpen(true)}>Gerenciar produtos</button><button onClick={() => { setAdmin(false); setAdminOpen(false); window.history.replaceState({}, '', '/'); }}>Sair</button></div>}
    <header className="header">
      <button className="icon-button mobile-only" onClick={() => setMenuOpen(!menuOpen)} aria-label="Abrir menu"><Menu/></button>
      <button className="brand" onClick={() => go('shop')}><span>FANTASIA</span><small>saboaria botânica</small></button>
      <nav className={menuOpen ? 'nav open' : 'nav'}>
        <button onClick={() => go('shop')}>Loja</button><button onClick={() => go('story')}>Nossa essência</button><button onClick={() => go('contact')}>Contato</button>
      </nav>
      <div className="header-actions">
        <button className="bag-button" onClick={() => setCartOpen(true)} aria-label={`Sacola com ${count} itens`}><ShoppingBag/><span>{count}</span></button>
      </div>
    </header>

    {view === 'shop' && <main>
      <section className="hero">
        <div className="hero-content"><p className="eyebrow">feito devagar. usado todos os dias.</p><h1>Um banho de<br/><em>natureza.</em></h1><p>Sabonetes artesanais em pequenos lotes, com aromas botânicos que cuidam do corpo e acalmam a rotina.</p><button className="primary" onClick={() => document.querySelector('#catalogo').scrollIntoView({ behavior: 'smooth' })}>Conhecer os aromas <ArrowRight size={18}/></button></div>
        <div className="hero-image"><img src="/products/alecrim-salvia.jpg" alt="Sabonetes artesanais de alecrim e sálvia"/><span className="stamp"><Leaf/><b>feito à mão</b><small>com carinho</small></span></div>
      </section>
      <section className="promise"><span><Sparkles/> Ingredientes selecionados</span><span><PackageCheck/> Pequenos lotes</span></section>
      <section className="catalog" id="catalogo">
        <div className="section-head"><div><p className="eyebrow">encontre o seu ritual</p><h2>Nossos aromas</h2></div><p>Escolha pelo aroma, pelo momento ou pela curiosidade. Cada barra é única.</p></div>
        <div className="catalog-tools"><label><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar um aroma"/></label><div className="filters">{['todos','fresco','herbal','floral','cítrico'].map(f => <button key={f} className={filter === f ? 'active':''} onClick={() => setFilter(f)}>{f}</button>)}</div></div>
        <div className="grid">{visible.map((p, index) => <ProductCard key={p.id} product={p} index={index} admin={admin} onSelect={setSelected} onAdd={add} onEdit={setEditing}/>)}</div>
        {!visible.length && <div className="empty"><Leaf/><h3>Nenhum aroma por aqui</h3><p>Tente buscar outro nome ou retirar o filtro.</p></div>}
      </section>
      <section className="ritual"><div><p className="eyebrow">mais que sabonete</p><h2>Um pequeno ritual, só seu.</h2><p>As formas, cores e pequenas variações contam a história de um processo feito à mão. Nenhuma barra é exatamente igual à outra — e essa é a beleza.</p><button className="text-button" onClick={() => go('story')}>Conheça a nossa essência <ArrowRight size={17}/></button></div><img src="/products/lavanda-alecrim.jpg" alt="Sabonetes de lavanda feitos artesanalmente"/></section>
    </main>}
    {view === 'story' && <SimplePage eyebrow="a nossa essência" title="Cuidado que começa na escolha." text="A Fantasia nasceu do desejo de transformar um hábito cotidiano em um momento de presença. Produzimos em pequenos lotes, respeitando o tempo de cada processo e escolhendo combinações botânicas que despertam os sentidos." image="/products/camomila-salvia.jpg"/>}
    {view === 'contact' && <ContactPage/>}
    {view === 'checkout' && <Checkout cart={cart} subtotal={subtotal} onBack={() => go('shop')} onDone={() => { setCart([]); go('success'); }}/>} 
    {view === 'success' && <Success onBack={() => go('shop')}/>} 

    <footer><div className="footer-brand"><b>FANTASIA</b><span>saboaria botânica</span><p>Feito à mão, com tempo e intenção.</p></div><div><strong>Navegue</strong><button onClick={() => go('shop')}>Loja</button><button onClick={() => go('story')}>Nossa essência</button><button onClick={() => go('contact')}>Contato</button></div><div><strong>Fale com a gente</strong><a href="mailto:oi@fantasiasaboaria.com.br">oi@fantasiasaboaria.com.br</a><a href="#instagram">@fantasiasaboaria</a></div><div className="newsletter"><strong>Cartas da Fantasia</strong><p>Novos aromas e pequenos cuidados, de vez em quando.</p><label><input placeholder="seu melhor e-mail"/><button aria-label="Cadastrar e-mail"><ArrowRight/></button></label></div></footer>
    <div className="copyright">© 2026 Fantasia Saboaria. Feito com calma no Brasil.</div>

    {selected && <ProductModal product={selected} onClose={() => setSelected(null)} onAdd={() => { add(selected); setSelected(null); }}/>} 
    {cartOpen && <CartDrawer cart={cart} subtotal={subtotal} freeShipping={freeShipping} onClose={() => setCartOpen(false)} changeQty={changeQty} onCheckout={() => go('checkout')}/>} 
    {adminOpen && <AdminPanel products={products} onClose={() => setAdminOpen(false)} onEdit={setEditing} onToggle={(id) => setProducts(ps => ps.map(p => p.id === id ? {...p, active: !p.active}:p))}/>} 
    {editing && <EditProduct product={editing} onClose={() => setEditing(null)} onSave={(updated) => { setProducts(ps => ps.map(p => p.id === updated.id ? updated : p)); setEditing(null); setToast('Produto atualizado com sucesso'); }}/>} 
    {toast && <div className="toast"><Check size={18}/>{toast}</div>}
    {menuOpen && <button className="page-shade" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"/>}
  </div>;
}

function ProductCard({product:p, index, admin, onSelect, onAdd, onEdit}) { return <article className="product-card" style={{'--delay': `${index*50}ms`}}>
  <button className="product-image" onClick={() => onSelect(p)}><img src={p.image} alt={`Sabonete artesanal ${p.name}`}/>{p.featured && <span className="featured-badge">queridinho</span>}<span className="view-label">Ver detalhes</span></button>
  <div className="product-info"><div><p className="tags">{p.notes.join(' · ')}</p><h3>{p.name}</h3><p>{p.short}</p></div><div className="card-bottom"><strong>{money(p.price)}</strong><button className="add-button" onClick={() => onAdd(p)} aria-label={`Adicionar ${p.name}`}><Plus/></button></div>{admin && <button className="edit-inline" onClick={() => onEdit(p)}><Pencil size={14}/> Editar produto</button>}</div>
  </article> }

function ProductModal({product:p,onClose,onAdd}) { return <div className="modal-wrap" role="dialog" aria-modal="true"><button className="modal-shade" onClick={onClose}/><div className="product-modal"><button className="close" onClick={onClose}><X/></button><div className="modal-image"><img src={p.image} alt={p.name}/></div><div className="modal-copy"><p className="eyebrow">{p.notes.join(' · ')}</p><h2>{p.name}</h2><p>{p.description}</p><div className="details"><span><Leaf/> Produção artesanal</span><span><Sparkles/> Aroma botânico</span><span><PackageCheck/> Aproximadamente 100g</span></div><div className="buy-row"><div><small>valor unitário</small><strong>{money(p.price)}</strong></div><button className="primary" onClick={onAdd}>Adicionar à sacola <ShoppingBag size={18}/></button></div><small className="variation">Por ser artesanal, cor e formato podem variar delicadamente.</small></div></div></div> }

function CartDrawer({cart,subtotal,freeShipping,onClose,changeQty,onCheckout}) { return <div className="drawer-wrap"><button className="modal-shade" onClick={onClose}/><aside className="drawer"><div className="drawer-head"><div><p className="eyebrow">seus escolhidos</p><h2>Sua sacola <span>({cart.reduce((a,i)=>a+i.qty,0)})</span></h2></div><button className="close" onClick={onClose}><X/></button></div>{cart.length ? <><div className="shipping-bar"><div><span style={{width:`${Math.min(subtotal/90*100,100)}%`}}/></div><p>{freeShipping ? <><Check size={15}/> Você ganhou frete grátis!</> : <>Faltam <b>{money(90-subtotal)}</b> para o frete grátis</>}</p></div><div className="cart-list">{cart.map(i => <div className="cart-item" key={i.id}><img src={i.image} alt=""/><div><h3>{i.name}</h3><p>{money(i.price)}</p><div className="qty"><button onClick={()=>changeQty(i.id,-1)}><Minus/></button><span>{i.qty}</span><button onClick={()=>changeQty(i.id,1)} disabled={i.qty>=i.stock}><Plus/></button></div></div><button className="remove" onClick={()=>changeQty(i.id,-i.qty)}><Trash2/></button></div>)}</div><div className="cart-total"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><p>Frete e prazo calculados no checkout.</p><button className="primary full" onClick={onCheckout}>Continuar para pagamento <ArrowRight/></button><small><LockKeyhole/> Compra segura e protegida</small></div></> : <div className="empty cart-empty"><ShoppingBag/><h3>Sua sacola está leve</h3><p>Que tal escolher um aroma para o seu próximo ritual?</p><button className="primary" onClick={onClose}>Explorar sabonetes</button></div>}</aside></div> }

function Checkout({cart,subtotal,onBack,onDone}) { const [step,setStep]=useState(1); const [ship,setShip]=useState(12.9); const total=subtotal+ship; if(!cart.length) return <main className="checkout empty"><ShoppingBag/><h2>Sua sacola está vazia</h2><button className="primary" onClick={onBack}>Voltar à loja</button></main>; return <main className="checkout"><button className="back" onClick={onBack}><ArrowLeft/> Voltar para a loja</button><div className="checkout-grid"><section><div className="checkout-title"><p className="eyebrow">finalize seu pedido</p><h1>Checkout</h1><div className="steps"><span className={step>=1?'done':''}>1 <b>Entrega</b></span><i/><span className={step>=2?'done':''}>2 <b>Pagamento</b></span><i/><span>3 <b>Confirmação</b></span></div></div>{step===1 ? <form onSubmit={e=>{e.preventDefault();setStep(2)}} className="form-card"><h2>Para onde enviamos?</h2><div className="field-grid"><label className="wide">E-mail<input required type="email" placeholder="voce@email.com"/></label><label className="wide">Nome completo<input required placeholder="Seu nome"/></label><label>CEP<input required inputMode="numeric" placeholder="00000-000"/></label><label>Celular<input required inputMode="tel" placeholder="(00) 00000-0000"/></label><label className="wide">Endereço<input required placeholder="Rua, avenida..."/></label><label>Número<input required/></label><label>Complemento<input placeholder="Apto, bloco..."/></label><label>Cidade<input required/></label><label>Estado<select required defaultValue=""><option value="" disabled>Selecione</option><option>SP</option><option>RJ</option><option>MG</option><option>PR</option><option>SC</option><option>Outro</option></select></label></div><h3>Forma de entrega</h3><button type="button" className="shipping-option selected" onClick={()=>setShip(12.9)}><span><Truck/><b>Entrega padrão</b><small>4 a 8 dias úteis</small></span><strong>{money(12.9)}</strong></button><button className="primary full" type="submit">Ir para pagamento <ArrowRight/></button></form> : <form onSubmit={e=>{e.preventDefault();onDone()}} className="form-card"><h2>Como você quer pagar?</h2><label className="payment selected"><input type="radio" defaultChecked/><span><b>Pix</b><small>Aprovação imediata</small></span><strong>5% de desconto</strong></label><label className="payment"><input type="radio" name="payment"/><span><b>Cartão de crédito</b><small>Em até 3x sem juros</small></span></label><div className="pix-box"><span>Valor no Pix</span><strong>{money(total*.95)}</strong><p>O código Pix será gerado após confirmar o pedido.</p></div><button className="primary full" type="submit">Confirmar pedido <LockKeyhole/></button><button className="text-button center" type="button" onClick={()=>setStep(1)}>Voltar para entrega</button></form>}</section><OrderSummary cart={cart} subtotal={subtotal} shipping={ship}/></div></main> }

function OrderSummary({cart,subtotal,shipping}) { return <aside className="order-summary"><h2>Resumo do pedido</h2>{cart.map(i=><div className="summary-item" key={i.id}><div><img src={i.image} alt=""/><span>{i.qty}</span></div><p>{i.name}</p><strong>{money(i.price*i.qty)}</strong></div>)}<div className="summary-lines"><p><span>Subtotal</span><b>{money(subtotal)}</b></p><p><span>Entrega</span><b>{money(shipping)}</b></p><p className="total"><span>Total</span><b>{money(subtotal+shipping)}</b></p></div><small><ShieldCheck/> Seus dados estão protegidos</small></aside> }

function AdminPanel({products,onClose,onEdit,onToggle}) { return <div className="drawer-wrap"><button className="modal-shade" onClick={onClose}/><aside className="drawer admin-panel"><div className="drawer-head"><div><p className="eyebrow">painel da loja</p><h2>Produtos</h2></div><button className="close" onClick={onClose}><X/></button></div><div className="admin-stats"><span><b>{products.filter(p=>p.active).length}</b> ativos</span><span><b>{products.reduce((a,p)=>a+p.stock,0)}</b> em estoque</span><span><b>{money(products[0]?.price||0)}</b> preço base</span></div><div className="admin-list">{products.map(p=><div className={!p.active?'disabled':''} key={p.id}><img src={p.image}/><span><b>{p.name}</b><small>{money(p.price)} · {p.stock} un.</small></span><button onClick={()=>onEdit(p)}><Pencil/></button><button className="toggle" onClick={()=>onToggle(p.id)}>{p.active?'Retirar':'Ativar'}</button></div>)}</div></aside></div> }

function EditProduct({product,onClose,onSave}) { const [form,setForm]=useState({...product}); return <div className="modal-wrap"><button className="modal-shade" onClick={onClose}/><form className="edit-modal" onSubmit={e=>{e.preventDefault();onSave(form)}}><div className="drawer-head"><div><p className="eyebrow">editar catálogo</p><h2>{product.name}</h2></div><button type="button" className="close" onClick={onClose}><X/></button></div><label>Nome do produto<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Descrição curta<input value={form.short} onChange={e=>setForm({...form,short:e.target.value})}/></label><label>Descrição completa<textarea rows="5" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><div className="field-grid"><label>Preço (R$)<input type="number" step="0.01" min="0" value={form.price} onChange={e=>setForm({...form,price:Number(e.target.value)})}/></label><label>Estoque<input type="number" min="0" value={form.stock} onChange={e=>setForm({...form,stock:Number(e.target.value)})}/></label></div><label className="check-label"><input type="checkbox" checked={form.featured||false} onChange={e=>setForm({...form,featured:e.target.checked})}/> Marcar como queridinho</label><button className="primary full">Salvar alterações <Check/></button></form></div> }

function SimplePage({eyebrow,title,text,image}) { return <main className="simple-page"><section><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p><blockquote>“A natureza não tem pressa — e ainda assim, tudo acontece.”</blockquote></div><img src={image}/></section><div className="values"><div><Leaf/><h3>Botânico</h3><p>Aromas inspirados em folhas, flores, ervas e raízes.</p></div><div><Sparkles/><h3>Artesanal</h3><p>Pequenos lotes com cuidado em cada etapa.</p></div><div><PackageCheck/><h3>Consciente</h3><p>Embalagens simples e escolhas com propósito.</p></div></div></main> }
function ContactPage(){ return <main className="contact-page"><div><p className="eyebrow">estamos por aqui</p><h1>Fale com a Fantasia.</h1><p>Dúvidas sobre aromas, pedidos ou presentes? Vai ser um prazer conversar com você.</p><a className="contact-link" href="https://wa.me/5511999999999"><span>WhatsApp<small>Segunda a sexta, das 9h às 18h</small></span><ArrowRight/></a><a className="contact-link" href="mailto:oi@fantasiasaboaria.com.br"><span>E-mail<small>oi@fantasiasaboaria.com.br</small></span><ArrowRight/></a><a className="contact-link" href="#instagram"><span>Instagram<small>@fantasiasaboaria</small></span><ArrowRight/></a></div><form onSubmit={e=>{e.preventDefault();alert('Mensagem enviada!')}}><label>Seu nome<input required/></label><label>Seu e-mail<input required type="email"/></label><label>Como podemos ajudar?<select><option>Tenho uma dúvida</option><option>Quero acompanhar meu pedido</option><option>Quero fazer uma encomenda</option></select></label><label>Mensagem<textarea required rows="5"/></label><button className="primary">Enviar mensagem <ArrowRight/></button></form></main> }
function Success({onBack}) { return <main className="success"><span><Check/></span><p className="eyebrow">pedido confirmado</p><h1>Obrigada por escolher a Fantasia.</h1><p>Seu pedido foi recebido e os detalhes chegaram no seu e-mail. Agora é só deixar a gente preparar tudo com carinho.</p><div><PackageCheck/><span><b>Pedido #FAN-2408</b><small>Você receberá atualizações por e-mail.</small></span></div><button className="primary" onClick={onBack}>Voltar para a loja</button></main> }

createRoot(document.getElementById('root')).render(<App/>);
