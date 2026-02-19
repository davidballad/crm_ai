import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProducts, useDeleteProduct } from '../hooks/useProducts';
import LowStockBadge from '../components/LowStockBadge';
import { Plus, Search, Pencil, Trash2, Package } from 'lucide-react';

export default function InventoryList() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const { data, isLoading, error } = useProducts(category ? { category } : undefined);
  const deleteMutation = useDeleteProduct();

  const products = data?.products || data?.items || [];
  const filtered = products.filter(
    (p) => !search || p.name?.toLowerCase().includes(search.toLowerCase()),
  );

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];

  const handleDelete = (id, name) => {
    if (window.confirm(`Delete "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">{products.length} products</p>
        </div>
        <Link to="/inventory/new" className="btn-primary gap-2">
          <Plus className="h-4 w-4" /> Add product
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9"
          />
        </div>
        {categories.length > 0 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="input-field sm:w-48"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="card text-center text-sm text-red-600">{error.message}</div>
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Package className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-600">No products yet</p>
          <p className="mt-1 text-sm text-gray-400">Add your first product to get started</p>
          <Link to="/inventory/new" className="btn-primary mt-4 gap-2">
            <Plus className="h-4 w-4" /> Add product
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit cost</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => (
                <tr key={p.id || p.sk} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500">{p.category || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{p.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.unit_cost != null ? `$${Number(p.unit_cost).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <LowStockBadge quantity={p.quantity} threshold={p.reorder_threshold ?? 10} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={`/inventory/${p.id}`}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
