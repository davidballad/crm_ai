import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useProducts, useDeleteProduct, useImportProducts } from '../hooks/useProducts';
import { downloadImportTemplate } from '../api/inventory';
import LowStockBadge from '../components/LowStockBadge';
import { Plus, Search, Pencil, Trash2, Package, Upload, Download } from 'lucide-react';

export default function InventoryList() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);
  const { data, isLoading, error } = useProducts(category ? { category } : undefined);
  const deleteMutation = useDeleteProduct();
  const importMutation = useImportProducts();

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

  const handleDownloadTemplate = async () => {
    try {
      await downloadImportTemplate();
    } catch (e) {
      setImportResult({ error: e.message });
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportResult(null);
    try {
      const text = await file.text();
      const result = await importMutation.mutateAsync(text);
      setImportResult(result);
    } catch (err) {
      setImportResult({ error: err.message });
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500">{products.length} products</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="btn-secondary gap-2"
          >
            <Download className="h-4 w-4" /> Template
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
            className="btn-secondary gap-2"
          >
            <Upload className="h-4 w-4" />
            {importMutation.isPending ? 'Importing...' : 'Import CSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Link to="/inventory/new" className="btn-primary gap-2">
            <Plus className="h-4 w-4" /> Add product
          </Link>
        </div>
      </div>

      {importResult && (
        <div className={`mb-4 rounded-lg p-3 text-sm ${importResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
          {importResult.error ? (
            importResult.error
          ) : (
            <>
              Imported <strong>{importResult.imported_count}</strong> products
              {importResult.error_count > 0 && (
                <span className="ml-2">({importResult.error_count} row(s) skipped)</span>
              )}
            </>
          )}
        </div>
      )}

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
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt="" className="h-9 w-9 shrink-0 rounded border border-gray-200 object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                      ) : null}
                      <span className="font-medium text-gray-900">{p.name}</span>
                    </div>
                  </td>
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
