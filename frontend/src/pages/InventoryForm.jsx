import { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useProduct, useCreateProduct, useUpdateProduct } from '../hooks/useProducts';
import { getUploadImageUrl } from '../api/inventory';
import { ArrowLeft, Upload } from 'lucide-react';

const EMPTY = {
  name: '',
  category: '',
  quantity: 0,
  unit_cost: '',
  reorder_threshold: 10,
  sku: '',
  unit: 'each',
  image_url: '',
  notes: '',
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
  const [uploading, setUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef(null);

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
        notes: product.notes || '',
      });
    }
  }, [existing]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleUploadImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const { upload_url, image_url } = await getUploadImageUrl({
        productId: isEdit ? id : null,
        filename: file.name,
        contentType: file.type || 'image/jpeg',
      });
      await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type || 'image/jpeg' },
      });
      if (!image_url) throw new Error('No image_url returned');
      setForm((prev) => ({ ...prev, image_url }));
    } catch (err) {
      setError(err.message || t('inventoryForm.imageUploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      ...form,
      quantity: Number(form.quantity),
      unit_cost: form.unit_cost ? Number(form.unit_cost) : undefined,
      reorder_threshold: Number(form.reorder_threshold),
      image_url: form.image_url?.trim() || undefined,
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
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.productImage')}</label>
            <div className="flex flex-wrap items-start gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-secondary inline-flex items-center gap-2"
              >
                {uploading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading ? t('inventoryForm.uploading') : t('inventoryForm.uploadImage')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadImage}
              />
              <button
                type="button"
                onClick={() => setShowUrlInput((v) => !v)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                {showUrlInput ? t('inventoryForm.hideUrl') : t('inventoryForm.orPasteImageUrl')}
              </button>
            </div>
            {showUrlInput && (
              <input
                type="url"
                value={form.image_url}
                onChange={update('image_url')}
                className="input-field mt-2"
                placeholder={t('inventoryForm.placeholderImageUrl')}
              />
            )}
            {form.image_url && (
              <div className="mt-2 flex items-center gap-2">
                <img
                  src={form.image_url}
                  alt=""
                  className="h-20 w-20 rounded border border-gray-200 object-cover"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                <span className="text-xs text-gray-500">{t('inventoryForm.imageStoredHint')}</span>
              </div>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">{t('inventoryForm.notes')}</label>
            <textarea rows={3} value={form.notes} onChange={update('notes')} className="input-field" />
          </div>
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
