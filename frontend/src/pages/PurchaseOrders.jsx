import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePurchaseOrders, useUpdatePurchaseOrder } from '../hooks/usePurchases';
import { useSuppliers } from '../hooks/useSuppliers';
import { Plus, ShoppingBag, ChevronRight, CheckCircle2, Send } from 'lucide-react';

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
  sent: { next: 'received', label: 'Confirmar recepción', Icon: CheckCircle2 },
};

function formatCurrency(v) {
  if (v == null) return '—';
  return `$${Number(v).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PurchaseOrders() {
  const [statusFilter, setStatusFilter] = useState('');
  const { data: orders = [], isLoading } = usePurchaseOrders(statusFilter ? { status: statusFilter } : undefined);
  const { data: suppliers = [] } = useSuppliers();
  const updateMutation = useUpdatePurchaseOrder();
  const [advancing, setAdvancing] = useState(null);

  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  const handleAdvance = async (order, nextStatus) => {
    setAdvancing(order.id);
    try {
      await updateMutation.mutateAsync({ id: order.id, data: { status: nextStatus } });
    } finally {
      setAdvancing(null);
    }
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Órdenes de compra</h1>
          <p className="mt-0.5 text-sm text-gray-500">{orders.length} orden{orders.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field w-auto text-sm"
          >
            <option value="">Todos los estados</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Link to="/app/purchases/new" className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" /> Nueva orden
          </Link>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <ShoppingBag className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">Sin órdenes de compra</p>
          <p className="mt-1 text-xs text-gray-400">Crea una orden para registrar la compra de mercancía a tus proveedores.</p>
          <Link to="/app/purchases/new" className="btn-primary mt-4">Crear orden</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const transition = STATUS_TRANSITIONS[order.status];
            const isAdvancing = advancing === order.id;
            const supplierName = order.supplier_id
              ? (supplierMap[order.supplier_id] ?? order.supplier_name)
              : order.supplier_name;

            return (
              <div key={order.id} className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                    <ShoppingBag className="h-5 w-5 text-brand-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-gray-900">{supplierName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                        {STATUS_LABEL[order.status]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {order.items?.length ?? 0} producto{(order.items?.length ?? 0) !== 1 ? 's' : ''} · {formatCurrency(order.total_cost)} · {formatDate(order.created_at)}
                    </p>
                    {order.notes && <p className="mt-1 text-xs text-gray-400 truncate">{order.notes}</p>}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {transition && (
                    <button
                      onClick={() => handleAdvance(order, transition.next)}
                      disabled={isAdvancing}
                      className="flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                    >
                      <transition.Icon className="h-3.5 w-3.5" />
                      {isAdvancing ? '...' : transition.label}
                    </button>
                  )}
                  <Link to={`/app/purchases/${order.id}`} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
