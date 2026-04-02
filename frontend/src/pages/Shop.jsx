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
    throw new Error(body?.error || `Solicitud fallida (${res.status})`);
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
  const [paymentMethod, setPaymentMethod] = useState('transfer'); // 'transfer' | 'card' | 'cash'
  const [datafastEnabled, setDatafastEnabled] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState('delivery'); // 'delivery' | 'pickup'
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [datafastCheckout, setDatafastCheckout] = useState(null); // { checkoutId, entityId, transactionId }
  const [bankInfo, setBankInfo] = useState(null);
  const [receiptFile, setReceiptFile] = useState(null);

  useEffect(() => {
    if (!token) { setErr(t('shop.missingToken')); setLoading(false); return; }

    // Handle return from Datafast payment widget
    const resourcePath = params.get('resourcePath');
    const txnId = params.get('txn_id');
    if (resourcePath && txnId) {
      shopFetch('/shop/datafast-result', token, {
        method: 'POST',
        body: JSON.stringify({ resource_path: resourcePath, transaction_id: txnId }),
      }).then(res => {
        if (res.approved) {
          setOrderResult({ total: res.total || '0', approved_card: true });
        } else {
          setErr('El pago no fue aprobado. Intenta de nuevo o usa transferencia.');
        }
      }).catch(() => setErr('No se pudo verificar el pago.'));
    }

    Promise.all([
      shopFetch('/shop/products', token),
      shopFetch('/shop/cart', token),
    ]).then(([p, c]) => {
      setProducts(p.products || []);
      setDatafastEnabled(p.datafast_enabled === true);
      if (p.bank_info) setBankInfo(p.bank_info);
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

  const filtered = useMemo(() => {
    const list = filter ? products.filter(p => p.category === filter) : products;
    return [...list].sort((a, b) => (b.promo_active ? 1 : 0) - (a.promo_active ? 1 : 0));
  }, [products, filter]);

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

  const handleGetLocation = useCallback(() => {
    if (!navigator.geolocation) { setErr('Tu navegador no soporta geolocalización.'); return; }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeliveryLocation(`${pos.coords.latitude},${pos.coords.longitude}`);
        setLocationLoading(false);
      },
      () => { setErr('No se pudo obtener tu ubicación.'); setLocationLoading(false); }
    );
  }, []);

  const handleCheckout = useCallback(async () => {
    if (paymentMethod === 'transfer' && !receiptFile) {
        setErr('Por favor sube el comprobante de tu transferencia para poder procesar la orden.');
        return;
    }

    setCheckingOut(true);
    setErr(null);
    try {
      let s3Key = null;

      if (paymentMethod === 'transfer' && receiptFile) {
        const uploadRes = await shopFetch('/shop/upload-url', token, {
          method: 'POST',
          body: JSON.stringify({ file_ext: receiptFile.name.split('.').pop() })
        });
        
        const putRes = await fetch(uploadRes.upload_url, {
          method: 'PUT',
          body: receiptFile,
          headers: { 'Content-Type': uploadRes.content_type || receiptFile.type || 'image/jpeg' }
        });
        
        if (!putRes.ok) throw new Error('Error subiendo el comprobante de pago.');
        s3Key = uploadRes.s3_key;
      }

      const res = await shopFetch('/shop/checkout', token, {
        method: 'POST',
        body: JSON.stringify({
          order_notes: (orderNotes || '').trim(),
          payment_method: paymentMethod,
          delivery_method: deliveryMethod,
          ...(deliveryMethod === 'delivery' && deliveryLocation && { delivery_location: deliveryLocation }),
          ...(s3Key && { payment_proof_s3_key: s3Key })
        }),
      });

      if (res.payment_method === 'card' && res.datafast_checkout_id) {
        // Load Datafast widget
        setDatafastCheckout({
          checkoutId: res.datafast_checkout_id,
          entityId: res.datafast_entity_id,
          transactionId: res.transaction_id,
        });
        setCart([]);
        setCartOpen(false);
      } else {
        setOrderResult(res);
        setCart([]);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setCheckingOut(false);
    }
  }, [token, orderNotes, paymentMethod, deliveryLocation, receiptFile]);

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

  if (datafastCheckout) {
    const shopperResultUrl = encodeURIComponent(
      `${window.location.origin}/shop?t=${token}&txn_id=${datafastCheckout.transactionId}`
    );
    const widgetSrc = `https://test.oppwa.com/v1/paymentWidgets.js?checkoutId=${datafastCheckout.checkoutId}`;
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm max-w-md w-full">
            <h1 className="mb-4 text-lg font-bold text-gray-900 text-center">Pago con tarjeta</h1>
            <form
              action={`/shop?t=${token}&txn_id=${datafastCheckout.transactionId}`}
              className="paymentWidgets"
              data-brands="VISA MASTER DINERS"
            />
            <script src={widgetSrc} />
          </div>
        </div>
        <PoweredByClienta liftForCartBar={false} />
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
            {orderResult.total && (
              <p className="mt-2 text-gray-600">
                {t('shop.total')}: <span className="font-semibold">${Number(orderResult.total).toFixed(2)}</span>
              </p>
            )}
            <p className="mt-4 text-sm text-gray-600">
              {orderResult.approved_card
                ? 'Pago con tarjeta aprobado. Te contactaremos por WhatsApp para coordinar la entrega.'
                : t('shop.orderSentToWhatsapp')}
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

      {/* Promo banner */}
      {products.some(p => p.promo_active) && (
        <div className="bg-orange-500 px-4 py-2.5 text-center text-sm font-medium text-white">
          🎉 ¡Promoción activa! Precios especiales por tiempo limitado
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
            const displayPrice = p.promo_active ? Number(p.promo_price) : Number(p.unit_cost);
            return (
              <div
                key={p.id}
                className={`flex flex-col rounded-xl border bg-white overflow-hidden shadow-sm ${unavailable ? 'opacity-90' : ''} ${p.promo_active ? 'border-orange-300' : 'border-gray-200'}`}
              >
                <div className="relative">
                  <img 
                    src={p.image_url || '/placeholder-product.png'} 
                    alt={p.name} 
                    className="h-32 w-full object-cover" 
                    onError={(e) => { e.target.src = '/placeholder-product.png'; }}
                  />
                  {p.promo_active && (
                    <span className="absolute left-2 top-2 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">PROMO</span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <h3 className="text-sm font-medium text-gray-900 leading-tight">{p.name}</h3>
                  {p.promo_active ? (
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-sm font-bold text-orange-600">${displayPrice.toFixed(2)}</span>
                      <span className="text-xs text-gray-400 line-through">${Number(p.unit_cost).toFixed(2)}</span>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm font-semibold text-brand-600">${displayPrice.toFixed(2)}</p>
                  )}
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
                    rows={2}
                    maxLength={ORDER_NOTES_MAX_LEN}
                    className="mb-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                  <p className="mb-3 text-right text-xs text-gray-500">
                    {orderNotes.length}/{ORDER_NOTES_MAX_LEN}
                  </p>

                  {/* Delivery method toggle */}
                  <div className="mb-3">
                    <p className="mb-1.5 text-xs font-medium text-gray-700">¿Cómo recibir tu pedido?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDeliveryMethod('delivery')}
                        className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${deliveryMethod === 'delivery' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        🚗 Entrega a domicilio
                      </button>
                      <button
                        type="button"
                        onClick={() => { setDeliveryMethod('pickup'); setDeliveryLocation(''); }}
                        className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${deliveryMethod === 'pickup' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        🏪 Retiro en tienda
                      </button>
                    </div>
                  </div>

                  {/* Location sharing (delivery only) */}
                  {deliveryMethod === 'delivery' && (
                    <div className="mb-3">
                      {deliveryLocation ? (
                        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                          <span className="text-xs text-green-700">📍 Ubicación capturada</span>
                          <button type="button" onClick={() => setDeliveryLocation('')} className="text-xs text-gray-400 hover:text-red-500">Quitar</button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleGetLocation}
                          disabled={locationLoading}
                          className="w-full rounded-lg border border-gray-300 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                        >
                          {locationLoading ? 'Obteniendo ubicación...' : '📍 Compartir mi ubicación (opcional)'}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Bank Transfer Details & Upload */}
                  {paymentMethod === 'transfer' && bankInfo && (
                    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <h4 className="mb-2 text-sm font-bold text-blue-900">Datos para transferencia</h4>
                      <div className="space-y-1 text-xs text-blue-800">
                        {bankInfo.bank_name && <p><strong>Banco:</strong> {bankInfo.bank_name}</p>}
                        {bankInfo.account_type && <p><strong>Tipo:</strong> {bankInfo.account_type}</p>}
                        {bankInfo.account_id && <p><strong>Cuenta:</strong> {bankInfo.account_id}</p>}
                        {bankInfo.person_name && <p><strong>Nombre:</strong> {bankInfo.person_name}</p>}
                        {bankInfo.identification_number && <p><strong>Cédula/RUC:</strong> {bankInfo.identification_number}</p>}
                      </div>
                      
                      <div className="mt-4 border-t border-blue-100 pt-4">
                        <label className="mb-2 block text-xs font-semibold text-blue-900">Sube tu comprobante de pago *</label>
                        <p className="mb-2 text-[11px] text-blue-600">📸 Toma una foto o selecciona una captura de pantalla</p>
                        {receiptFile ? (
                          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-green-600">✅</span>
                              <span className="text-xs text-green-700 truncate">{receiptFile.name}</span>
                            </div>
                            <button type="button" onClick={() => setReceiptFile(null)} className="text-xs text-gray-400 hover:text-red-500 shrink-0 ml-2">Quitar</button>
                          </div>
                        ) : (
                          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/50 py-4 text-sm font-medium text-blue-700 transition-colors hover:border-blue-400 hover:bg-blue-100/50 active:bg-blue-100">
                            📷 Tomar foto o elegir imagen
                            <input 
                              type="file" 
                              accept="image/jpeg,image/png" 
                              onChange={(e) => setReceiptFile(e.target.files[0] || null)}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Payment method selector */}
                  <div className={`mb-3 grid gap-2 ${datafastEnabled ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('transfer')}
                      className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${paymentMethod === 'transfer' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      🏦 Transferencia
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('cash')}
                      className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${paymentMethod === 'cash' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      💵 Efectivo
                    </button>
                    {datafastEnabled && (
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('card')}
                        className={`rounded-lg border py-2.5 text-xs font-medium transition-colors ${paymentMethod === 'card' ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                      >
                        💳 Tarjeta
                      </button>
                    )}
                  </div>

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
