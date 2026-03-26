import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, Plus, Minus, Trash2, X, ChevronUp } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';
const ORDER_NOTES_MAX_LEN = 300;

async function shopFetch(path, token, options = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_URL}${path}${sep}token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

function PoweredByClienta({ liftForCartBar = false }) {
  const { t } = useTranslation();
  return (
    <footer
      className={`pointer-events-none fixed right-3 z-20 max-w-[calc(100vw-1.5rem)] sm:right-4 ${liftForCartBar ? 'bottom-20' : 'bottom-4'}`}
      aria-label={t('shop.poweredByAria')}
    >
      <div className="flex justify-end">
        <a
          href="https://www.clientaai.com"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200/90 bg-white/95 px-2.5 py-1.5 text-[11px] text-gray-500 shadow-md backdrop-blur-sm transition-colors hover:border-gray-300 hover:text-gray-800"
        >
          <span className="whitespace-nowrap tracking-tight">{t('shop.poweredBy')}</span>
          <img src="/mainLogo.png" alt="Clienta AI" className="h-5 w-auto shrink-0" />
        </a>
      </div>
    </footer>
  );
}

export default function Shop() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('t') || '';

  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [filter, setFilter] = useState('');
  const [orderNotes, setOrderNotes] = useState('');

  useEffect(() => {
    if (!token) { setErr(t('shop.missingToken')); setLoading(false); return; }
    Promise.all([
      shopFetch('/shop/products', token),
      shopFetch('/shop/cart', token),
    ]).then(([p, c]) => {
      setProducts(p.products || []);
      setCart(c.items || []);
    }).catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [token]);

  const cartQtyMap = useMemo(() => {
    const m = {};
    cart.forEach(i => { m[i.product_id] = i.quantity; });
    return m;
  }, [cart]);

  const cartTotal = useMemo(() =>
    cart.reduce((s, i) => s + Number(i.unit_price || 0) * i.quantity, 0),
  [cart]);

  const cartCount = useMemo(() =>
    cart.reduce((s, i) => s + i.quantity, 0),
  [cart]);

  const categories = useMemo(() => {
    const s = new Set(products.map(p => p.category).filter(Boolean));
    return ['', ...Array.from(s).sort()];
  }, [products]);

  const filtered = useMemo(() =>
    filter ? products.filter(p => p.category === filter) : products,
  [products, filter]);

  const updateCart = useCallback(async (product_id, action, quantity = 1) => {
    try {
      const res = await shopFetch('/shop/cart', token, {
        method: 'POST',
        body: JSON.stringify({ product_id, action, quantity }),
      });
      setCart(res.items || []);
    } catch (e) {
      setErr(e.message);
    }
  }, [token]);

  const handleCheckout = useCallback(async () => {
    setCheckingOut(true);
    setErr(null);
    try {
      const res = await shopFetch('/shop/checkout', token, {
        method: 'POST',
        body: JSON.stringify({ order_notes: (orderNotes || '').trim() }),
      });
      setOrderResult(res);
      setCart([]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setCheckingOut(false);
    }
  }, [token, orderNotes]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (err && !products.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <p className="text-center text-red-600">{err}</p>
      </div>
    );
  }

  if (orderResult) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm max-w-md w-full">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-700">
              <ShoppingCart className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">{t('shop.orderConfirmed')}</h1>
            <p className="mt-2 text-gray-600">
              {t('shop.total')}: <span className="font-semibold">${Number(orderResult.total).toFixed(2)}</span>
            </p>
            <p className="mt-4 text-sm text-gray-600">
              {t('shop.orderSentToWhatsapp')}
            </p>
            {orderResult.wa_link && (
              <a
                href={orderResult.wa_link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700 transition-colors"
              >
                <img src="/whatsapp-glyph.svg" alt="" className="h-5 w-5 brightness-0 invert" />
                {t('shop.openWhatsapp')}
              </a>
            )}
          </div>
        </div>
        <PoweredByClienta liftForCartBar={false} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <h1 className="truncate text-base font-semibold text-gray-900">{t('shop.pageTitle')}</h1>
          <button
            type="button"
            onClick={() => setCartOpen(!cartOpen)}
            className="relative rounded-lg p-2 text-gray-700 hover:bg-gray-100"
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Category filter */}
      {categories.length > 2 && (
        <div className="sticky top-14 z-20 border-b border-gray-100 bg-white px-4 py-2 overflow-x-auto">
          <div className="mx-auto flex max-w-2xl gap-2">
            {categories.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === c ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {c || t('shop.all')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Products */}
      <main className="mx-auto max-w-2xl px-4 pt-4">
        {err && <p className="mb-4 text-sm text-red-600">{err}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map(p => {
            const qty = cartQtyMap[p.id] || 0;
            const stock = p.quantity != null ? Number(p.quantity) : 0;
            const unavailable = stock <= 0;
            return (
              <div
                key={p.id}
                className={`flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm ${unavailable ? 'opacity-90' : ''}`}
              >
                {p.image_url ? (
                  <img src={p.image_url} alt={p.name} className="h-32 w-full object-cover" />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-gray-100 text-gray-400 text-xs">{t('shop.noImage')}</div>
                )}
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="text-sm font-medium text-gray-900 leading-tight">{p.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-brand-600">${Number(p.unit_cost).toFixed(2)}</p>
                  <div className="mt-auto pt-2">
                    {unavailable ? (
                      <button
                        type="button"
                        disabled
                        className="flex w-full cursor-not-allowed items-center justify-center gap-1 rounded-lg border border-gray-200 bg-gray-100 py-2 text-xs font-medium text-gray-500"
                      >
                        {t('shop.notAvailable')}
                      </button>
                    ) : qty === 0 ? (
                      <button
                        type="button"
                        onClick={() => updateCart(p.id, 'add')}
                        className="flex w-full items-center justify-center gap-1 rounded-lg bg-brand-600 py-2 text-xs font-medium text-white hover:bg-brand-700 transition-colors"
                      >
                        <Plus className="h-3.5 w-3.5" /> {t('shop.add')}
                      </button>
                    ) : (
                      <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50">
                        <button type="button" onClick={() => updateCart(p.id, 'set', qty - 1)} className="px-2.5 py-1.5 text-gray-600 hover:text-red-600">
                          {qty === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                        </button>
                        <span className="text-sm font-semibold text-gray-900">{qty}</span>
                        <button type="button" onClick={() => updateCart(p.id, 'add')} className="px-2.5 py-1.5 text-gray-600 hover:text-brand-600">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <p className="mt-12 text-center text-sm text-gray-500">{t('shop.noProducts')}</p>
        )}
      </main>

      {/* Cart panel (slides up) */}
      {cartOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setCartOpen(false)} />
          <div className="relative z-50 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
              <h2 className="text-base font-semibold text-gray-900">{t('shop.cart')} ({cartCount})</h2>
              <button type="button" onClick={() => setCartOpen(false)} className="rounded p-1 text-gray-500 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {cart.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">{t('shop.cartEmpty')}</p>
            ) : (
              <>
                <ul className="divide-y divide-gray-100 px-4">
                  {cart.map(i => (
                    <li key={i.product_id} className="flex items-center gap-3 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{i.product_name}</p>
                        <p className="text-xs text-gray-500">${Number(i.unit_price).toFixed(2)} {t('shop.each')}</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50">
                        <button type="button" onClick={() => updateCart(i.product_id, 'set', i.quantity - 1)} className="px-2 py-1 text-gray-600 hover:text-red-600">
                          {i.quantity === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                        </button>
                        <span className="min-w-[1.5rem] text-center text-sm font-semibold">{i.quantity}</span>
                        <button type="button" onClick={() => updateCart(i.product_id, 'add')} className="px-2 py-1 text-gray-600 hover:text-brand-600">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="w-16 text-right text-sm font-semibold text-gray-900">
                        ${(Number(i.unit_price) * i.quantity).toFixed(2)}
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-gray-100 px-4 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-gray-700">{t('shop.total')}</span>
                    <span className="text-lg font-bold text-gray-900">${cartTotal.toFixed(2)}</span>
                  </div>
                  <textarea
                    value={orderNotes}
                    onChange={e => setOrderNotes(e.target.value.slice(0, ORDER_NOTES_MAX_LEN))}
                    placeholder={t('shop.orderNotesPlaceholder')}
                    rows={3}
                    maxLength={ORDER_NOTES_MAX_LEN}
                    className="mb-3 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                  <p className="mb-3 text-right text-xs text-gray-500">
                    {orderNotes.length}/{ORDER_NOTES_MAX_LEN}
                  </p>
                  <button
                    type="button"
                    onClick={handleCheckout}
                    disabled={checkingOut || cart.length === 0}
                    className="w-full rounded-lg bg-green-600 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {checkingOut ? t('shop.placingOrder') : t('shop.placeOrder')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating cart bar (when cart has items and panel is closed) */}
      {cartCount > 0 && !cartOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white px-4 py-3 shadow-lg">
          <div className="mx-auto flex max-w-2xl items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {cartCount} {t(cartCount !== 1 ? 'shop.items' : 'shop.item')} — ${cartTotal.toFixed(2)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 transition-colors"
            >
              <ChevronUp className="h-4 w-4" /> {t('shop.viewCart')}
            </button>
          </div>
        </div>
      )}

      <PoweredByClienta liftForCartBar={cartCount > 0 && !cartOpen} />
    </div>
  );
}
