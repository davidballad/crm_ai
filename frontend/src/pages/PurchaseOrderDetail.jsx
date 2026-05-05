import { useNavigate, useParams } from 'react-router-dom';
import { usePurchaseOrder, useUpdatePurchaseOrder } from '../hooks/usePurchases';
import { useSuppliers } from '../hooks/useSuppliers';
import { ArrowLeft, CheckCircle2, Send, X } from 'lucide-react';

const STATUS_LABEL = {
  draft: 'Borrador',
  sent: 'Enviada',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};

const STATUS_TRANSITIONS = {
  draft: { next: 'sent', label: 'Marcar enviada', Icon: Send },
  sent: { next: 'received', label: 'Confirmar recepción (+stock)', Icon: CheckCircle2 },
};

const CANCEL_ALLOWED = ['draft', 'sent'];

function formatCurrency(v) {
  if (v == null) return '—';
  return `$${Number(v).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = usePurchaseOrder(id);
  const { data: suppliers = [] } = useSuppliers();
  const updateMutation = useUpdatePurchaseOrder();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const order = data?.purchase_order ?? data;
  if (!order) return <p className="text-sm text-gray-500">Orden no encontrada.</p>;

  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));
  const supplierName = order.supplier_id
    ? (supplierMap[order.supplier_id] ?? order.supplier_name)
    : order.supplier_name;
  const transition = STATUS_TRANSITIONS[order.status];

  const handleAdvance = async () => {
    if (!transition) return;
    await updateMutation.mutateAsync({ id: order.id, data: { status: transition.next } });
    navigate('/app/purchases');
  };

  const handleCancel = async () => {
    if (!confirm('¿Estás seguro de que deseas cancelar esta orden?')) return;
    await updateMutation.mutateAsync({ id: order.id, data: { status: 'cancelled' } });
    navigate('/app/purchases');
  };

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => navigate('/app/purchases')} className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" /> Órdenes de compra
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{supplierName}</h1>
          <p className="mt-0.5 text-sm text-gray-400">Creada {formatDate(order.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
          {transition && (
            <button
              onClick={handleAdvance}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <transition.Icon className="h-3.5 w-3.5" />
              {updateMutation.isPending ? '...' : transition.label}
            </button>
          )}
          {CANCEL_ALLOWED.includes(order.status) && (
            <button
              onClick={handleCancel}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-200 disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
              {updateMutation.isPending ? '...' : 'Cancelar'}
            </button>
          )}
        </div>
      </div>

      <div className="card mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-xs font-medium text-gray-500">
              <th className="pb-2 text-left">Producto</th>
              <th className="pb-2 text-right">Cant.</th>
              <th className="pb-2 text-right">Costo unit.</th>
              <th className="pb-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {(order.items ?? []).map((item, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="py-2 font-medium text-gray-800">{item.product_name}</td>
                <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                <td className="py-2 text-right text-gray-600">{formatCurrency(item.unit_cost)}</td>
                <td className="py-2 text-right font-medium text-gray-800">{formatCurrency(item.quantity * item.unit_cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right text-sm font-semibold text-gray-700">Total</td>
              <td className="pt-3 text-right text-sm font-bold text-brand-700">{formatCurrency(order.total_cost)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {order.notes && (
        <div className="card text-sm text-gray-600">
          <p className="mb-1 text-xs font-medium text-gray-400">Notas</p>
          {order.notes}
        </div>
      )}
    </div>
  );
}
