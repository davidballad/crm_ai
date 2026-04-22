import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useProduct, useCreateProduct, useUpdateProduct } from '../hooks/useProducts';
import { getUploadImageUrl } from '../api/inventory';
import { ArrowLeft, Upload, Tag, X, Plus, ImageIcon } from 'lucide-react';

const MAX_IMAGES = 5;

const EMPTY = {
  name: '',
  category: '',
  quantity: 0,
  unit_cost: '',
  reorder_threshold: 10,
  sku: '',
  unit: 'each',
  image_url: '',
  image_urls: [],
  description: '',
  notes: '',
  tags: '',
  promo_price: '',
  promo_end_at: '',
};

export default function InventoryForm() {
  const { t } = useTranslation();
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { data: existing, isLoading } = useProduct(id);
  const createMutation = useCreateProduct();
  const updateMutation = useUpdateProduct();

  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [uploadingIndex, setUploadingIndex] = useState(null);
  const fileInputRef = useRef(null);
  const uploadingSlotRef = useRef(null);

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
        image_url: product.image_url || '',
        image_urls: Array.isArray(product.image_urls) ? product.image_urls : [],
        description: product.description || '',
        notes: product.notes || '',
        tags: Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || ''),
        promo_price: product.promo_price != null ? String(product.promo_price) : '',
        promo_end_at: product.promo_end_at || '',
      });
    }
  }, [existing]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0];
    const slotIndex = uploadingSlotRef.current;
    if (!file || slotIndex == null) return;
    setError('');
    setUploadingIndex(slotIndex);
    try {
      const { upload_url, image_url } = await getUploadImageUrl({
        productId: isEdit ? id : null,
        filename: file.name,
        contentType: file.type || 'image/jpeg',
        imageIndex: slotIndex,
      });
      await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'image/jpeg' },
      });
      if (!image_url) throw new Error('No se recibio image_url');
      setForm((prev) => {
        const urls = [...(prev.image_urls || [])];
        urls[slotIndex] = image_url;
        return {
          ...prev,
          image_urls: urls,
          image_url: slotIndex === 0 ? image_url : prev.image_url,
        };
      });
    } catch (err) {
      setError(err.message || t('inventoryForm.imageUploadFailed'));
    } finally {
      setUploadingIndex(null);
      uploadingSlotRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerUpload = (index) => {
    uploadingSlotRef.current = index;
    fileInputRef.current?.click();
  };

  const removeImage = (index) => {
    setForm((prev) => {
      const urls = [...(prev.image_urls || [])];
      urls.splice(index, 1);
      return {
        ...prev,
        image_urls: urls,
        image_url: index === 0 ? (urls[0] || '') : prev.image_url,
      };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const rawTags = (form.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const payload = {
      ...form,
      quantity: Number(form.quantity),
      unit_cost: form.unit_cost ? Number(form.unit_cost) : undefined,
      reorder_threshold: Number(form.reorder_threshold),
      image_url: form.image_urls?.[0]?.trim() || form.image_url?.trim() || undefined,
      image_urls: form.image_urls?.filter(Boolean).length > 0 ? form.image_urls.filter(Boolean) : undefined,
      tags: rawTags.length > 0 ? rawTags : undefined,
      promo_price: form.promo_price ? Number(form.promo_price) : null,
      promo_end_at: form.promo_end_at || null,
    };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      navigate('/app/inventory');
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
      <button onClick={() => navigate('/app/inventory')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> {t('inventoryForm.backToInventory')}
      </button>

      <h1 className="mb-6 text-xl font-bold text-gray-900">
        {isEdit ? t('inventoryForm.editProduct') : t('inventoryForm.addProduct')}
      </h1>

      <form onSubmit={handleSubmit} className="card space-y-5">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.productName')}</label>
            <input required value={form.name} onChange={update('name')} className="input-field" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.category')}</label>
            <input value={form.category} onChange={update('category')} className="input-field" placeholder={t('inventoryForm.placeholderCategory')} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.sku')}</label>
            <input value={form.sku} onChange={update('sku')} className="input-field" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.quantity')}</label>
            <input type="number" min="0" required value={form.quantity} onChange={update('quantity')} className="input-field" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.unit')}</label>
            <select value={form.unit} onChange={update('unit')} className="input-field">
              <option value="each">{t('inventoryForm.unitEach')}</option>
              <option value="kg">{t('inventoryForm.unitKg')}</option>
              <option value="lb">{t('inventoryForm.unitLb')}</option>
              <option value="liter">{t('inventoryForm.unitLiter')}</option>
              <option value="oz">{t('inventoryForm.unitOz')}</option>
              <option value="case">{t('inventoryForm.unitCase')}</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.unitCost')}</label>
            <input type="number" step="0.01" min="0" value={form.unit_cost} onChange={update('unit_cost')} className="input-field" />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.reorderThreshold')}</label>
            <input type="number" min="0" value={form.reorder_threshold} onChange={update('reorder_threshold')} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Fotos del producto <span className="text-xs font-normal text-gray-400">({(form.image_urls || []).filter(Boolean).length}/{MAX_IMAGES})</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadImage}
            />
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: MAX_IMAGES }).map((_, i) => {
                const url = form.image_urls?.[i];
                const isUploading = uploadingIndex === i;
                return (
                  <div key={i} className="relative aspect-square">
                    {url ? (
                      <>
                        <img
                          src={url}
                          alt={`Foto ${i + 1}`}
                          className="h-full w-full rounded-lg border border-gray-200 object-cover"
                          onError={(e) => { e.target.src = '/placeholder-product.png'; }}
                        />
                        {i === 0 && (
                          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">Principal</span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(i)}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => triggerUpload(i)}
                        disabled={isUploading}
                        className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-400 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-500 disabled:cursor-wait"
                      >
                        {isUploading ? (
                          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                        ) : (
                          <>
                            {i === 0 ? <Upload className="h-5 w-5" /> : <Plus className="h-4 w-4" />}
                            <span className="text-[10px] leading-none">{i === 0 ? 'Principal' : `Foto ${i + 1}`}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-gray-400">Puedes subir hasta 5 fotos. La primera es la foto principal del producto.</p>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Descripción <span className="text-xs font-normal text-gray-400">(se muestra en la tienda)</span>
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={update('description')}
              className="input-field"
              placeholder="Describe tu producto: ingredientes, tamaño, características destacadas..."
              maxLength={500}
            />
            <p className="mt-1 text-right text-xs text-gray-400">{form.description.length}/500</p>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.notes')}</label>
            <textarea rows={3} value={form.notes} onChange={update('notes')} className="input-field" />
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.tags')}</label>
            <input
              value={form.tags}
              onChange={update('tags')}
              className="input-field"
              placeholder={t('inventoryForm.tagsPlaceholder')}
            />
            <p className="mt-1 text-xs text-gray-500">{t('inventoryForm.tagsHint')}</p>
          </div>
        </div>

        {/* Promo section */}
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-semibold text-orange-800">Promoción</span>
            {form.promo_price && form.promo_end_at && new Date(form.promo_end_at) > new Date() && (
              <span className="rounded-full bg-orange-200 px-2 py-0.5 text-xs font-medium text-orange-700">Activa</span>
            )}
          </div>
          <p className="text-xs text-orange-600">Muestra este producto con precio especial en la tienda. Se desactiva automáticamente al vencer.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Precio promocional ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.promo_price}
                onChange={update('promo_price')}
                className="input-field"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Válido hasta</label>
              <input
                type="datetime-local"
                value={form.promo_end_at ? form.promo_end_at.slice(0, 16) : ''}
                onChange={(e) => setForm({ ...form, promo_end_at: e.target.value ? e.target.value + ':00' : '' })}
                className="input-field"
              />
            </div>
          </div>
          {form.promo_price && !form.promo_end_at && (
            <p className="text-xs text-orange-600">⚠️ Agrega una fecha de vencimiento para activar la promo.</p>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => navigate('/app/inventory')} className="btn-secondary">{t('inventoryForm.cancel')}</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? t('inventoryForm.saving') : isEdit ? t('inventoryForm.updateProduct') : t('inventoryForm.createProduct')}
          </button>
        </div>
      </form>
    </div>
  );
}
