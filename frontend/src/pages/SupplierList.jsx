import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSuppliers, useDeleteSupplier } from '../hooks/useSuppliers';
import { Plus, Pencil, Trash2, Building2, Phone, Mail, Clock } from 'lucide-react';

export default function SupplierList() {
  const { data: suppliers = [], isLoading } = useSuppliers();
  const deleteMutation = useDeleteSupplier();
  const [confirmId, setConfirmId] = useState(null);

  const handleDelete = async (id) => {
    await deleteMutation.mutateAsync(id);
    setConfirmId(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Proveedores</h1>
          <p className="mt-0.5 text-sm text-gray-500">{suppliers.length} proveedor{suppliers.length !== 1 ? 'es' : ''}</p>
        </div>
        <Link to="/app/suppliers/new" className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nuevo proveedor
        </Link>
      </div>

      {suppliers.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">Sin proveedores aún</p>
          <p className="mt-1 text-xs text-gray-400">Agrega tu primer proveedor para vincularlo a tus productos y órdenes de compra.</p>
          <Link to="/app/suppliers/new" className="btn-primary mt-4">Agregar proveedor</Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suppliers.map((s) => (
            <div key={s.id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                    <Building2 className="h-5 w-5 text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{s.name}</p>
                    {s.lead_time_days != null && (
                      <p className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="h-3 w-3" /> {s.lead_time_days}d entrega
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Link to={`/app/suppliers/${s.id}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand-600">
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button onClick={() => setConfirmId(s.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-1 text-xs text-gray-500">
                {s.contact_phone && (
                  <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{s.contact_phone}</p>
                )}
                {s.contact_email && (
                  <p className="flex items-center gap-1.5 truncate"><Mail className="h-3.5 w-3.5 shrink-0" />{s.contact_email}</p>
                )}
                {s.address && (
                  <p className="truncate text-gray-400">{s.address}</p>
                )}
              </div>

              {s.notes && (
                <p className="line-clamp-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">{s.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">¿Eliminar proveedor?</h2>
            <p className="mt-1 text-sm text-gray-500">Esta acción no se puede deshacer. Los productos vinculados a este proveedor no serán eliminados.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmId(null)} className="btn-secondary">Cancelar</button>
              <button
                onClick={() => handleDelete(confirmId)}
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
