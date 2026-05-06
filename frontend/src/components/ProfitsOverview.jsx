import { TrendingUp, DollarSign, ShoppingCart, BarChart2 } from 'lucide-react';

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0);

function MetricCard({ icon: Icon, label, value, sub, colorClass }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${colorClass ?? 'text-gray-900'}`}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        {Icon && (
          <div className="ml-3 shrink-0 rounded-lg bg-indigo-50 p-2 text-indigo-600">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProfitsOverview({ summary, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
        ))}
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">
        No hay datos de ganancias disponibles para este período.
      </div>
    );
  }

  const costPct =
    summary.total_sales > 0
      ? ((summary.total_cost / summary.total_sales) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          icon={DollarSign}
          label="Ventas Totales"
          value={fmt(summary.total_sales)}
        />
        <MetricCard
          icon={ShoppingCart}
          label="Costo Total"
          value={fmt(summary.total_cost)}
          sub={`${costPct}% de ventas`}
          colorClass="text-amber-600"
        />
        <MetricCard
          icon={TrendingUp}
          label="Ganancia Total"
          value={fmt(summary.total_profit)}
          sub={`Margen ${summary.margin_percent?.toFixed(1)}%`}
          colorClass="text-emerald-600"
        />
        <MetricCard
          icon={BarChart2}
          label="Transacciones"
          value={summary.transaction_count}
          sub={`~${fmt(summary.avg_profit_per_transaction)} ganancia promedio`}
        />
      </div>

      {summary.suppliers && summary.suppliers.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Costo por Proveedor</h3>
          <div className="space-y-3">
            {summary.suppliers
              .sort((a, b) => b.total_cost - a.total_cost)
              .map((supplier, idx) => (
                <div key={idx} className="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {supplier.supplier_name || 'Sin asignar'}
                    </p>
                    <p className="text-xs text-gray-500">{supplier.item_count} producto{supplier.item_count !== 1 ? 's' : ''}</p>
                  </div>
                  <p className="text-sm font-semibold text-amber-600">{fmt(supplier.total_cost)}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
