import { useState } from 'react';
import { TrendingUp, DollarSign, ShoppingCart, BarChart2, Package, Truck } from 'lucide-react';
import { useProfitsSummary } from '../hooks/useProfits';

const PERIODS = [
  { value: 'this-month', label: 'Este Mes' },
  { value: 'last-month', label: 'Mes Pasado' },
  { value: 'this-year', label: 'Este Año' },
  { value: 'all-time', label: 'Todo' },
];

const TABS = [
  { id: 'overview', label: 'Resumen' },
  { id: 'by-product', label: 'Por Producto' },
  { id: 'by-supplier', label: 'Por Proveedor' },
];

const fmt = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n ?? 0);

function MarginBadge({ pct }) {
  const color =
    pct >= 40 ? 'bg-emerald-50 text-emerald-700' :
    pct >= 20 ? 'bg-amber-50 text-amber-700' :
    'bg-red-50 text-red-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {pct?.toFixed(1)}%
    </span>
  );
}

function MetricCard({ icon: Icon, label, value, sub, colorClass, iconBg }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
          <p className={`mt-1.5 text-2xl font-bold tracking-tight ${colorClass ?? 'text-gray-900'}`}>{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        {Icon && (
          <div className={`ml-3 shrink-0 rounded-xl p-2.5 ${iconBg ?? 'bg-indigo-50 text-indigo-600'}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return <div className="h-28 animate-pulse rounded-2xl border border-gray-100 bg-gray-100" />;
}

function SkeletonRow() {
  return (
    <tr>
      {[...Array(6)].map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-gray-100" style={{ width: i === 0 ? '70%' : '50%' }} />
        </td>
      ))}
    </tr>
  );
}

function OverviewTab({ summary, loading }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <div className="h-48 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-400">
        No hay datos de ganancias para este período.
      </div>
    );
  }

  const costPct = summary.total_sales > 0
    ? ((summary.total_cost / summary.total_sales) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          icon={DollarSign}
          label="Ventas Totales"
          value={fmt(summary.total_sales)}
          iconBg="bg-blue-50 text-blue-600"
        />
        <MetricCard
          icon={ShoppingCart}
          label="Costo Total"
          value={fmt(summary.total_cost)}
          sub={`${costPct}% de ventas`}
          colorClass="text-amber-600"
          iconBg="bg-amber-50 text-amber-600"
        />
        <MetricCard
          icon={TrendingUp}
          label="Ganancia Neta"
          value={fmt(summary.total_profit)}
          sub={`Margen ${summary.margin_percent?.toFixed(1)}%`}
          colorClass="text-emerald-600"
          iconBg="bg-emerald-50 text-emerald-600"
        />
        <MetricCard
          icon={BarChart2}
          label="Transacciones"
          value={summary.transaction_count ?? 0}
          sub={`~${fmt(summary.avg_profit_per_transaction)} por venta`}
          iconBg="bg-violet-50 text-violet-600"
        />
      </div>

      {/* Margin bar */}
      {summary.total_sales > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Desglose de ingresos</p>
            <MarginBadge pct={summary.margin_percent} />
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-amber-400 transition-all duration-700"
              style={{ width: `${costPct}%` }}
            />
            <div
              className="h-full bg-emerald-500 transition-all duration-700"
              style={{ width: `${Math.max(0, summary.margin_percent)}%` }}
            />
          </div>
          <div className="mt-2.5 flex gap-5 text-xs text-gray-500">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" />Costo ({costPct}%)</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />Ganancia ({summary.margin_percent?.toFixed(1)}%)</span>
          </div>
        </div>
      )}

      {/* Supplier cost breakdown */}
      {summary.suppliers && summary.suppliers.length > 0 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Costo por Proveedor</h3>
          <div className="divide-y divide-gray-50">
            {summary.suppliers
              .sort((a, b) => b.total_cost - a.total_cost)
              .map((supplier, idx) => (
                <div key={idx} className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {supplier.supplier_name || 'Sin asignar'}
                    </p>
                    <p className="text-xs text-gray-400">{supplier.item_count} unidad{supplier.item_count !== 1 ? 'es' : ''}</p>
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

function ProductTable({ rows, loading }) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['PRODUCTO', 'VENDIDO', 'VENTAS', 'COSTO', 'GANANCIA', 'MARGEN'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
          </tbody>
        </table>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-400">
        No hay datos de productos para este período.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Producto</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Vendido</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Ventas</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Costo</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Ganancia</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => (
              <tr key={row.product_id} className="transition-colors hover:bg-gray-50/60">
                <td className="px-4 py-3.5">
                  <div>
                    <p className="font-medium text-gray-900">{row.product_name}</p>
                    {row.supplier_name && (
                      <p className="text-xs text-gray-400">{row.supplier_name}</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3.5 text-right tabular-nums text-gray-600">{row.units_sold}</td>
                <td className="px-4 py-3.5 text-right tabular-nums text-gray-900">{fmt(row.total_sales)}</td>
                <td className="px-4 py-3.5 text-right tabular-nums text-amber-600">{fmt(row.total_cost)}</td>
                <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-emerald-600">{fmt(row.total_profit)}</td>
                <td className="px-4 py-3.5 text-right">
                  <MarginBadge pct={row.margin_percent} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SupplierTable({ rows, loading }) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['PROVEEDOR', 'UNIDADES', 'VENTAS', 'COSTO', 'GANANCIA', 'MARGEN'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
          </tbody>
        </table>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-400">
        No hay datos de proveedores para este período.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Proveedor</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Unidades</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Ventas</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Costo</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Ganancia</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Margen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row, idx) => (
              <tr key={row.supplier_id ?? idx} className="transition-colors hover:bg-gray-50/60">
                <td className="px-4 py-3.5 font-medium text-gray-900">{row.supplier_name}</td>
                <td className="px-4 py-3.5 text-right tabular-nums text-gray-600">{row.units_sold}</td>
                <td className="px-4 py-3.5 text-right tabular-nums text-gray-900">{fmt(row.total_sales)}</td>
                <td className="px-4 py-3.5 text-right tabular-nums text-amber-600">{fmt(row.total_cost)}</td>
                <td className="px-4 py-3.5 text-right tabular-nums font-semibold text-emerald-600">{fmt(row.total_profit)}</td>
                <td className="px-4 py-3.5 text-right">
                  <MarginBadge pct={row.margin_percent} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Profits() {
  const [period, setPeriod] = useState('this-month');
  const [tab, setTab] = useState('overview');
  const { data: summary, isLoading, error } = useProfitsSummary(period);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ganancias y Analíticas</h1>
        <p className="mt-1 text-sm text-gray-500">
          Visualiza tus márgenes, costos y rentabilidad por período.
        </p>
      </div>

      {/* Period + Tabs row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium transition-all ${
                tab === id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {id === 'overview' && <BarChart2 className="h-3.5 w-3.5" />}
              {id === 'by-product' && <Package className="h-3.5 w-3.5" />}
              {id === 'by-supplier' && <Truck className="h-3.5 w-3.5" />}
              {label}
            </button>
          ))}
        </div>

        {/* Period filter */}
        <div className="flex gap-1.5">
          {PERIODS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setPeriod(value)}
              className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                period === value
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error cargando datos de ganancias.
        </div>
      )}

      {tab === 'overview' && (
        <OverviewTab summary={summary} loading={isLoading} />
      )}
      {tab === 'by-product' && (
        <ProductTable rows={summary?.by_product} loading={isLoading} />
      )}
      {tab === 'by-supplier' && (
        <SupplierTable rows={summary?.by_supplier} loading={isLoading} />
      )}
    </div>
  );
}
