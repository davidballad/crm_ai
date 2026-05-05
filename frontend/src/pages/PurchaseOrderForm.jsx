import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePurchaseOrder } from '../hooks/usePurchases';
import { useSuppliers } from '../hooks/useSuppliers';
import { useProducts } from '../hooks/useProducts';
import { ArrowLeft, Trash2, Search } from 'lucide-react';

function formatCurrency(v) {
  if (!v && v !== 0) return '';
  return `$${Number(v).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PurchaseOrderForm() {
  const navigate = useNavigate();
  const { data: suppliers = [] } = useSuppliers();
  const { data: productsData } = useProducts();
  const products = productsData?.products ?? (Array.isArray(productsData) ? productsData : []);
  const createMutation = useCreatePurchaseOrder();

  const [supplierId, setSupplierId] = useState('');
  const [supplierNameFree, setSupplierNameFree] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [error, setError] = useState('');

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const supplierName = selectedSupplier?.name || supplierNameFree;

  const filteredProducts = products.filter((p) =>
    productSearch.length < 2 ? false : p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addItem = (product) => {
    setProductSearch('');
    if (items.find((i) => i.product_id === product.id)) return;
    setItems((prev) => [
      ...prev,
      {
        product_id: product.id,
        product_name: product.name,
        quantity: 1,
        unit_cost: product.unit_cost != null ? String(product.unit_cost) : '',
      },
    ]);
  };

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const removeItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const totalCost = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const cost = Number(item.unit_cost) || 0;
    return sum + qty * cost;
  }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!supplierName.trim()) {
      setError('Selecciona o escribe el nombre del proveedor');
      return;
    }
    if (items.length === 0) {
      setError('Agrega al menos un producto');
      return;
    }
    for (const item of items) {
      if (!item.quantity || Number(item.quantity) <= 0) {
        setError(`Cantidad inválida para "${item.product_name}"`);
        return;
      }
      if (item.unit_cost === '' || Number(item.unit_cost) < 0) {
        setError(`Costo inválido para "${item.product_name}"`);
        return;
      }
    }

    const payload = {
      supplier_name: supplierName.trim(),
      supplier_id: supplierId || undefined,
      notes: notes.trim() || undefined,
      items: items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity),
        unit_cost: item.unit_cost,
      })),
    };

    try {
      await createMutation.mutateAsync(payload);
      navigate('/app/purchases');
    } catch (err) {
      setError(err.message || 'Error al crear la orden');
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => navigate('/app/purchases')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Órdenes de compra
      </button>

      <h1 className="mb-6 text-xl font-bold text-gray-900">Nueva orden de compra</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Supplier */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Proveedor</h2>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Seleccionar proveedor existente</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="input-field">
              <option value="">— Seleccionar —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {!supplierId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">O escribe el nombre</label>
              <input
                value={supplierNameFree}
                onChange={(e) => setSupplierNameFree(e.target.value)}
                className="input-field"
                placeholder="Nombre del proveedor"
              />
            </div>
          )}
        </div>

        {/* Items */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Productos</h2>

          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="input-field pl-9"
                placeholder="Buscar producto por nombre..."
              />
            </div>
            {filteredProducts.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
                {filteredProducts.slice(0, 6).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addItem(p)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50 first:rounded-t-xl last:rounded-b-xl"
                  >
                    <span className="font-medium text-gray-900">{p.name}</span>
                    {p.unit_cost != null && <span className="text-xs text-gray-400">Costo: {formatCurrency(p.unit_cost)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={item.product_id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <span className="flex-1 truncate text-sm font-medium text-gray-800">{item.product_name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div>
                      <label className="text-[10px] text-gray-400">Cantidad</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                        className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400">Costo unit.</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unit_cost}
                        onChange={(e) => updateItem(idx, 'unit_cost', e.target.value)}
                        className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        placeholder="0.00"
                      />
                    </div>
                    <button type="button" onClick={() => removeItem(idx)} className="ml-1 rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex justify-end pt-1">
                <span className="text-sm font-semibold text-gray-700">Total: <span className="text-brand-700">{formatCurrency(totalCost)}</span></span>
              </div>
            </div>
          )}

          {items.length === 0 && (
            <p className="text-center text-xs text-gray-400 py-4">Busca y agrega productos arriba</p>
          )}
        </div>

        {/* Notes */}
        <div className="card">
          <label className="mb-1 block text-sm font-medium text-gray-700">Notas (opcional)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="input-field" placeholder="Número de factura, condiciones de pago..." />
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/app/purchases')} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={createMutation.isPending} className="btn-primary">
            {createMutation.isPending ? 'Creando...' : 'Crear orden (borrador)'}
          </button>
        </div>
      </form>
    </div>
  );
}
