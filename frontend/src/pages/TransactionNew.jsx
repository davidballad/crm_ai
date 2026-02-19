import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useRecordSale } from '../hooks/useTransactions';
import { ArrowLeft, Plus, Minus, Trash2 } from 'lucide-react';

export default function TransactionNew() {
  const navigate = useNavigate();
  const { data: productData } = useProducts();
  const saleMutation = useRecordSale();

  const products = productData?.products || productData?.items || [];

  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const addToCart = (product) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product_id === product.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          quantity: 1,
          unit_price: Number(product.unit_cost || 0),
          max_qty: product.quantity,
        },
      ];
    });
  };

  const updateQty = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((c) => (c.product_id === productId ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c))
        .filter((c) => c.quantity > 0),
    );
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((c) => c.product_id !== productId));
  };

  const total = cart.reduce((sum, c) => sum + c.quantity * c.unit_price, 0);

  const handleSubmit = async () => {
    if (cart.length === 0) {
      setError('Add at least one item');
      return;
    }
    setError('');
    try {
      await saleMutation.mutateAsync({
        items: cart.map(({ product_id, product_name, quantity, unit_price }) => ({
          product_id,
          product_name,
          quantity,
          unit_price,
        })),
        total,
        payment_method: paymentMethod,
        notes: notes || undefined,
      });
      navigate('/transactions');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <button onClick={() => navigate('/transactions')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to transactions
      </button>

      <h1 className="mb-6 text-xl font-bold text-gray-900">Record a sale</h1>

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Product picker */}
        <div className="lg:col-span-3">
          <div className="card">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Select products</h2>
            {products.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">No products available</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    disabled={p.quantity === 0}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-500">
                        ${Number(p.unit_cost || 0).toFixed(2)} &middot; {p.quantity} in stock
                      </div>
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-brand-600" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Cart / checkout */}
        <div className="lg:col-span-2">
          <div className="card sticky top-6">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">Cart</h2>

            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No items added</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {cart.map((item) => (
                  <div key={item.product_id} className="flex items-center justify-between py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{item.product_name}</div>
                      <div className="text-xs text-gray-500">${item.unit_price.toFixed(2)} each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(item.product_id, -1)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm tabular-nums">{item.quantity}</span>
                      <button onClick={() => updateQty(item.product_id, 1)} className="rounded p-1 text-gray-400 hover:bg-gray-100">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => removeFromCart(item.product_id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="mb-4 flex items-center justify-between text-lg font-bold text-gray-900">
                <span>Total</span>
                <span className="tabular-nums">${total.toFixed(2)}</span>
              </div>

              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Payment method</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input-field">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" placeholder="Optional" />
              </div>

              <button
                onClick={handleSubmit}
                disabled={cart.length === 0 || saleMutation.isPending}
                className="btn-primary w-full"
              >
                {saleMutation.isPending ? 'Processing...' : 'Complete sale'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
