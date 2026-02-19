import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useProduct, useCreateProduct, useUpdateProduct } from '../hooks/useProducts';
import { ArrowLeft } from 'lucide-react';

const EMPTY = {
  name: '',
  category: '',
  quantity: 0,
  unit_cost: '',
  reorder_threshold: 10,
  sku: '',
  unit: 'each',
  notes: '',
};

export default function InventoryForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { data: existing, isLoading } = useProduct(id);
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existing) {
      const product = existing.product || existing;
      setForm({
        name: product.name || '',
        category: product.category || '',
        quantity: product.quantity ?? 0,
        unit_cost: product.unit_cost != null ? String(product.unit_cost) : '',
        reorder_threshold: product.reorder_threshold ?? 10,
        sku: product.sku || '',
        unit: product.unit || 'each',
        notes: product.notes || '',
      });
    }
  }, [existing]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...form,
      quantity: Number(form.quantity),
      unit_cost: form.unit_cost ? Number(form.unit_cost) : undefined,
      reorder_threshold: Number(form.reorder_threshold),
    };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      navigate('/inventory');
    } catch (err) {
      setError(err.message);
    }
  };

  if (isEdit && isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => navigate('/inventory')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Back to inventory
      </button>

      <h1 className="mb-6 text-xl font-bold text-gray-900">
        {isEdit ? 'Edit product' : 'Add product'}
      </h1>

      <form onSubmit={handleSubmit} className="card space-y-5">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Product name *</label>
            <input required value={form.name} onChange={update('name')} className="input-field" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
            <input value={form.category} onChange={update('category')} className="input-field" placeholder="e.g. Food, Beverage" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">SKU</label>
            <input value={form.sku} onChange={update('sku')} className="input-field" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Quantity *</label>
            <input type="number" min="0" required value={form.quantity} onChange={update('quantity')} className="input-field" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Unit</label>
            <select value={form.unit} onChange={update('unit')} className="input-field">
              <option value="each">Each</option>
              <option value="kg">Kilogram</option>
              <option value="lb">Pound</option>
              <option value="liter">Liter</option>
              <option value="oz">Ounce</option>
              <option value="case">Case</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Unit cost ($)</label>
            <input type="number" step="0.01" min="0" value={form.unit_cost} onChange={update('unit_cost')} className="input-field" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Reorder threshold</label>
            <input type="number" min="0" value={form.reorder_threshold} onChange={update('reorder_threshold')} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea rows={3} value={form.notes} onChange={update('notes')} className="input-field" />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/inventory')} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : isEdit ? 'Update product' : 'Create product'}
          </button>
        </div>
      </form>
    </div>
  );
}
