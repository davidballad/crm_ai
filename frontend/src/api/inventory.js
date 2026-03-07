import { api, getTokenGetter } from './client';

const API_URL = import.meta.env.VITE_API_URL || '';

export function fetchProducts({ category, nextToken } = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (nextToken) params.set('next_token', nextToken);
  const qs = params.toString();
  return api.get(`/inventory${qs ? `?${qs}` : ''}`);
}

export function fetchProduct(id) {
  return api.get(`/inventory/${id}`);
}

export function createProduct(data) {
  return api.post('/inventory', data);
}

export function updateProduct(id, data) {
  return api.put(`/inventory/${id}`, data);
}

export function deleteProduct(id) {
  return api.delete(`/inventory/${id}`);
}

/** Import products from CSV string. Returns { imported_count, error_count, imported, errors }. */
export function importFromCsv(csvText) {
  return api.postRaw('/inventory/import', csvText, 'text/csv');
}

const CSV_TEMPLATE = 'name,category,quantity,unit_cost,reorder_threshold,unit,sku,image_url,notes\nChicken Breast,Food,100,4.50,20,lb,,,Fresh boneless\nRice,Food,200,1.20,30,lb,,,Long grain\n';

/** Download CSV template. */
export async function downloadImportTemplate() {
  if (API_URL) {
    const getToken = getTokenGetter();
    const token = getToken?.();
    const res = await fetch(`${API_URL}/inventory/import/template`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Failed to download template');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inventory_template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  } else {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inventory_template.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
