import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSupplier, useCreateSupplier, useUpdateSupplier } from '../hooks/useSuppliers';
import { ArrowLeft } from 'lucide-react';

const EMPTY = {
  name: '',
  contact_phone: '',
  contact_email: '',
  address: '',
  lead_time_days: '',
  notes: '',
};

export default function SupplierForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { data: existing, isLoading } = useSupplier(id);
  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    if (existing) {
      const s = existing.supplier ?? existing;
      setForm({
        name: s.name || '',
        contact_phone: s.contact_phone || '',
        contact_email: s.contact_email || '',
        address: s.address || '',
        lead_time_days: s.lead_time_days != null ? String(s.lead_time_days) : '',
        notes: s.notes || '',
      });
    }
  }, [existing]);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      name: form.name.trim(),
      contact_phone: form.contact_phone.trim() || undefined,
      contact_email: form.contact_email.trim() || undefined,
      address: form.address.trim() || undefined,
      lead_time_days: form.lead_time_days ? Number(form.lead_time_days) : undefined,
      notes: form.notes.trim() || undefined,
    };
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id, data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      navigate('/app/suppliers');
    } catch (err) {
      setError(err.message || 'Error al guardar proveedor');
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
    <div className="mx-auto max-w-lg">
      <button onClick={() => navigate('/app/suppliers')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Proveedores
      </button>

      <h1 className="mb-6 text-xl font-bold text-gray-900">
        {isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
      </h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre *</label>
          <input required value={form.name} onChange={update('name')} className="input-field" placeholder="Ej. Distribuidora Norte" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono</label>
            <input type="tel" value={form.contact_phone} onChange={update('contact_phone')} className="input-field" placeholder="+593 99 000 0000" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Correo</label>
            <input type="email" value={form.contact_email} onChange={update('contact_email')} className="input-field" placeholder="ventas@proveedor.com" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Dirección</label>
          <input value={form.address} onChange={update('address')} className="input-field" placeholder="Av. Principal 123, Ciudad" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tiempo de entrega (días)</label>
          <input type="number" min="0" value={form.lead_time_days} onChange={update('lead_time_days')} className="input-field" placeholder="3" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Notas</label>
          <textarea rows={3} value={form.notes} onChange={update('notes')} className="input-field" placeholder="Condiciones de pago, contactos adicionales..." />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={() => navigate('/app/suppliers')} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear proveedor'}
          </button>
        </div>
      </form>
    </div>
  );
}
