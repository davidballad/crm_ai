import { useRef, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useProducts, useDeleteProduct, useImportProducts, useUpdateProduct } from '../hooks/useProducts';
import { downloadImportTemplate, downloadInventoryExport, getUploadImageUrls, updateProduct } from '../api/inventory';
import LowStockBadge from '../components/LowStockBadge';
import { Plus, Search, Pencil, Trash2, Package, Upload, Download, ImagePlus, Tag, X, Clock, Truck, PlusCircle, Check } from 'lucide-react';
import { useTenantConfig } from '../hooks/useTenantConfig';
import { patchTenantConfig } from '../api/onboarding';
import { useQueryClient } from '@tanstack/react-query';

function isPromoActive(p) {
  const end = p.promo_end_at;
  return !!(end && p.promo_price != null && new Date(end) > new Date());
}

function PromoModal({ product, onClose }) {
  const updateMutation = useUpdateProduct();
  const active = isPromoActive(product);
  const [promoPrice, setPromoPrice] = useState(product.promo_price != null ? String(product.promo_price) : '');
  const [promoEndAt, setPromoEndAt] = useState(product.promo_end_at ? product.promo_end_at.slice(0, 16) : '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        id: product.id,
        data: {
          promo_price: promoPrice ? Number(promoPrice) : null,
          promo_end_at: promoEndAt ? promoEndAt + ':00' : null,
        },
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await updateMutation.mutateAsync({ id: product.id, data: { promo_price: null, promo_end_at: null } });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Oferta — {product.name}</h2>
            {active && <p className="text-xs text-orange-600 mt-0.5">Oferta activa hasta {new Date(product.promo_end_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Precio regular: ${product.unit_cost != null ? Number(product.unit_cost).toFixed(2) : '—'}</label>
            <label className="block text-xs font-medium text-gray-700 mb-1">Precio de oferta ($)</label>
            <input type="number" step="0.01" min="0" value={promoPrice} onChange={e => setPromoPrice(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="0.00" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Válido hasta</label>
            <input type="datetime-local" value={promoEndAt} onChange={e => setPromoEndAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          </div>
        </div>
        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          {active && (
            <button onClick={handleClear} disabled={saving} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60">
              Quitar oferta
            </button>
          )}
          <button onClick={handleSave} disabled={saving || !promoPrice || !promoEndAt}
            className="flex-1 rounded-lg bg-orange-500 px-3 py-2 text-xs font-medium text-white hover:bg-orange-600 disabled:opacity-60">
            {saving ? 'Guardando…' : 'Guardar oferta'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeliveryZonesManager() {
  const { data: tenantConfig } = useTenantConfig();
  const queryClient = useQueryClient();
  const [zones, setZones] = useState([]);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [zoneError, setZoneError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (tenantConfig?.delivery_zones) setZones(tenantConfig.delivery_zones);
  }, [tenantConfig?.delivery_zones]);

  if (!tenantConfig?.delivery_enabled) return null;

  const addZone = () => {
    setZoneError('');
    const name = newName.trim();
    const price = parseFloat(newPrice);
    if (!name) return setZoneError('El nombre de la zona no puede estar vacío');
    if (isNaN(price) || price < 0) return setZoneError('El precio debe ser un número positivo');
    if (zones.some(z => z.name === name)) return setZoneError('Ya existe una zona con ese nombre');
    setZones(prev => [...prev, { name, price }]);
    setNewName('');
    setNewPrice('');
  };

  const removeZone = (name) => setZones(prev => prev.filter(z => z.name !== name));

  const saveZones = async () => {
    setSaving(true);
    setZoneError('');
    setSaved(false);
    try {
      await patchTenantConfig({ delivery_zones: zones });
      await queryClient.invalidateQueries({ queryKey: ['tenantConfig'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setZoneError(e.message || 'Error al guardar zonas');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Truck className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">Zonas de Entrega</h2>
      </div>

      {zones.length > 0 && (
        <ul className="mb-4 space-y-1">
          {zones.map(z => (
            <li key={z.name} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <span className="font-medium text-gray-800">{z.name}</span>
              <div className="flex items-center gap-3">
                <span className="tabular-nums text-gray-600">${Number(z.price).toFixed(2)}</span>
                <button onClick={() => removeZone(z.name)} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Nombre (ej. Centro)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <input
          type="number"
          placeholder="Precio"
          min="0"
          step="0.01"
          value={newPrice}
          onChange={e => setNewPrice(e.target.value)}
          className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button onClick={addZone} className="flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200">
          <PlusCircle className="h-3.5 w-3.5" />
          Agregar
        </button>
      </div>

      {zoneError && <p className="mb-2 text-xs text-red-600">{zoneError}</p>}

      <button
        onClick={saveZones}
        disabled={saving}
        className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saved ? <><Check className="h-3.5 w-3.5" /> Guardado</> : saving ? 'Guardando...' : 'Guardar zonas'}
      </button>
    </div>
  );
}

export default function InventoryList() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [imageUploadResult, setImageUploadResult] = useState(null);
  const [promoProduct, setPromoProduct] = useState(null);
  const fileInputRef = useRef(null);
  const imageFilesInputRef = useRef(null);
  const { data, isLoading, error } = useProducts(category ? { category } : undefined);
  const deleteMutation = useDeleteProduct();
  const importMutation = useImportProducts();

  const products = data?.products || data?.items || [];
  const filtered = products.filter(
    (p) => !search || p.name?.toLowerCase().includes(search.toLowerCase()),
  );

  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))];

  const handleDelete = (id, name) => {
    if (window.confirm(`Eliminar "${name}"?`)) {
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

  const handleDownloadInventory = async () => {
    try {
      await downloadInventoryExport();
    } catch (e) {
      setImportResult({ error: e.message });
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportResult(null);
    setImageUploadResult(null);
    try {
      const text = await file.text();
      const result = await importMutation.mutateAsync(text);
      setImportResult(result);
    } catch (err) {
      setImportResult({ error: err.message });
    }
  };

  const handleImageFilesChange = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length || !importResult?.imported?.length) return;
    const productIds = importResult.imported.slice(0, files.length).map((p) => p.id);
    if (!productIds.length) return;
    setImageUploadResult({ status: 'uploading', done: 0, total: productIds.length });
    try {
      const { uploads } = await getUploadImageUrls(productIds);
      let done = 0;
      for (let i = 0; i < Math.min(files.length, uploads.length); i++) {
        await fetch(uploads[i].upload_url, {
          method: 'PUT',
          body: files[i],
          headers: { 'Content-Type': files[i].type || 'image/jpeg' },
        });
        await updateProduct(uploads[i].product_id, { image_url: uploads[i].image_url });
        done++;
        setImageUploadResult({ status: 'uploading', done, total: uploads.length });
      }
      setImageUploadResult({ status: 'done', done, total: uploads.length });
      importMutation.mutate(); // refresh list
    } catch (err) {
      setImageUploadResult({ status: 'error', error: err.message });
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Inventario</h1>
          <p className="text-sm text-gray-500">{products.length} productos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="btn-secondary gap-2"
          >
            <Download className="h-4 w-4" /> Plantilla
          </button>
          <button
            type="button"
            onClick={handleDownloadInventory}
            className="btn-secondary gap-2"
          >
            <Download className="h-4 w-4" /> Exportar inventario
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
            className="btn-secondary gap-2"
          >
            <Upload className="h-4 w-4" />
            {importMutation.isPending ? 'Importando...' : 'Importar CSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Link to="/app/inventory/new" className="btn-primary gap-2">
            <Plus className="h-4 w-4" /> Agregar producto
          </Link>
        </div>
      </div>

      {importResult && (
        <div className="mb-4 space-y-2">
          <div className={`rounded-lg p-3 text-sm ${importResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
            {importResult.error ? (
              importResult.error
            ) : (
              <>
                Se importaron <strong>{importResult.imported_count}</strong> productos
                {importResult.error_count > 0 && (
                  <span className="ml-2">({importResult.error_count} fila(s) omitida(s))</span>
                )}
              </>
            )}
          </div>
          {!importResult.error && importResult.imported?.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
              <p className="mb-2 font-medium text-gray-700">Agregar imagenes (opcional)</p>
              <p className="mb-2 text-gray-500">Selecciona imagenes en el mismo orden de las filas CSV. Primera imagen → primer producto, etc.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => imageFilesInputRef.current?.click()}
                  className="btn-secondary inline-flex items-center gap-2"
                >
                  <ImagePlus className="h-4 w-4" />
                  Subir imagenes para productos importados
                </button>
                <input
                  ref={imageFilesInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageFilesChange}
                />
                {imageUploadResult?.status === 'uploading' && (
                  <span className="text-gray-600">
                    {imageUploadResult.done}/{imageUploadResult.total} subidas...
                  </span>
                )}
                {imageUploadResult?.status === 'done' && (
                  <span className="text-green-700">
                    {imageUploadResult.done} producto(s) ya tienen imagen.
                  </span>
                )}
                {imageUploadResult?.status === 'error' && (
                  <span className="text-red-600">{imageUploadResult.error}</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active promos section */}
      {products.filter(isPromoActive).length > 0 && (
        <div className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-semibold text-orange-800">Ofertas activas en la tienda</span>
          </div>
          <div className="space-y-2">
            {products.filter(isPromoActive).map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-white border border-orange-100 px-3 py-2">
                <div className="flex items-center gap-3 min-w-0">
                  {p.image_url && <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">
                      <span className="line-through mr-1">${Number(p.unit_cost).toFixed(2)}</span>
                      <span className="text-orange-600 font-semibold">${Number(p.promo_price).toFixed(2)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1 text-xs text-orange-600">
                    <Clock className="h-3 w-3" />
                    {new Date(p.promo_end_at).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                  <button onClick={() => setPromoProduct(p)} className="rounded-lg border border-orange-200 px-2 py-1 text-xs text-orange-700 hover:bg-orange-100">
                    Editar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar productos..."
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
            <option value="">Todas las categorias</option>
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
          <p className="font-medium text-gray-600">Aun no hay productos</p>
          <p className="mt-1 text-sm text-gray-400">Agrega tu primer producto para empezar</p>
          <Link to="/app/inventory/new" className="btn-primary mt-4 gap-2">
            <Plus className="h-4 w-4" /> Agregar producto
          </Link>
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <div className="space-y-3 lg:hidden">
            {filtered.map((p) => (
              <div key={p.id || p.sk} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src={p.image_url || '/placeholder-product.png'}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg border border-gray-200 object-cover"
                    onError={(e) => { e.target.src = '/placeholder-product.png'; }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                    {p.category && <p className="text-xs text-gray-400 mt-0.5">{p.category}</p>}
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <div className="flex gap-4">
                    <div>
                      <p className="text-[10px] uppercase font-medium text-gray-400">Stock</p>
                      <p className="text-lg font-bold text-gray-900 tabular-nums">{p.quantity}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-medium text-gray-400">Precio</p>
                      <p className="text-lg font-bold text-gray-900 tabular-nums">
                        {p.unit_cost != null ? `$${Number(p.unit_cost).toFixed(2)}` : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <LowStockBadge quantity={p.quantity} threshold={p.reorder_threshold ?? 10} />
                    {isPromoActive(p) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        <Tag className="h-3 w-3" /> Oferta
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => setPromoProduct(p)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      isPromoActive(p)
                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Oferta
                  </button>
                  <Link
                    to={`/app/inventory/${p.id}`}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Editar
                  </Link>
                  <button
                    onClick={() => handleDelete(p.id, p.name)}
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden lg:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3 text-right">Costo unitario</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((p) => (
                  <tr key={p.id || p.sk} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={p.image_url || '/placeholder-product.png'}
                          alt=""
                          className="h-9 w-9 shrink-0 rounded border border-gray-200 object-cover"
                          onError={(e) => { e.target.src = '/placeholder-product.png'; }}
                        />
                        <span className="font-medium text-gray-900">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.category || '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.quantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.unit_cost != null ? `$${Number(p.unit_cost).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <LowStockBadge quantity={p.quantity} threshold={p.reorder_threshold ?? 10} />
                        {isPromoActive(p) && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                            <Tag className="h-3 w-3" /> Oferta
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setPromoProduct(p)}
                          className={`rounded-lg p-1.5 hover:bg-orange-50 ${isPromoActive(p) ? 'text-orange-500' : 'text-gray-400 hover:text-orange-500'}`}
                          title="Gestionar oferta"
                        >
                          <Tag className="h-4 w-4" />
                        </button>
                        <Link
                          to={`/app/inventory/${p.id}`}
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
        </>
      )}

      <DeliveryZonesManager />

      {promoProduct && <PromoModal product={promoProduct} onClose={() => setPromoProduct(null)} />}
    </div>
  );
}
