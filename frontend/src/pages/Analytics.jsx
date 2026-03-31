import { useState, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Users, ShoppingCart, DollarSign, Calendar } from 'lucide-react';
import { useRevenueRange } from '../hooks/useTransactions';
import { useContactStats } from '../hooks/useContacts';

const RANGE_OPTIONS = [
  { label: 'Últimos 7 días', days: 7 },
  { label: 'Últimos 30 días', days: 30 },
  { label: 'Últimos 90 días', days: 90 },
];

const TIER_COLORS = {
  bronze: '#cd7f32',
  silver: '#a8a9ad',
  gold: '#FFD700',
};

const STATUS_LABELS = {
  prospect: 'Prospecto',
  interested: 'Interesado',
  closed_won: 'Compró',
  abandoned: 'Abandonado',
};

const STATUS_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444'];

const PAYMENT_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#06b6d4', '#ec4899'];

function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days + 1);
  const fmt = (d) => d.toISOString().split('T')[0];
  return { start: fmt(start), end: fmt(end) };
}

function StatCard({ icon: Icon, label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    blue: 'bg-blue-50 text-blue-600',
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className={`rounded-lg p-2 ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function formatCurrency(v) {
  if (v == null) return '$0';
  return `$${Number(v).toLocaleString('es', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  if (days <= 7) return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric' });
  if (days <= 31) return d.toLocaleDateString('es', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('es', { month: 'short', day: 'numeric' });
}

export default function Analytics() {
  const [selectedRange, setSelectedRange] = useState(1); // index into RANGE_OPTIONS
  const { days } = RANGE_OPTIONS[selectedRange];
  const { start, end } = useMemo(() => getDateRange(days), [days]);

  const { data: revenueData, isLoading: loadingRevenue } = useRevenueRange(start, end);
  const { data: statsData, isLoading: loadingStats } = useContactStats();

  const dailyRevenue = revenueData?.revenue || [];
  const stats = statsData || {};

  const totalRevenue = dailyRevenue.reduce((s, d) => s + (d.revenue || 0), 0);
  const totalOrders = dailyRevenue.reduce((s, d) => s + (d.order_count || 0), 0);
  const totalItems = dailyRevenue.reduce((s, d) => s + (d.items_sold || 0), 0);

  const chartData = dailyRevenue.map((d) => ({
    ...d,
    label: formatDate(d.date, days),
  }));

  // Customer tier breakdown for pie chart
  const tierData = stats.by_tier
    ? Object.entries(stats.by_tier).map(([tier, count]) => ({
        name: tier.charAt(0).toUpperCase() + tier.slice(1),
        value: count,
        fill: TIER_COLORS[tier] || '#94a3b8',
      }))
    : [];

  // Lead status breakdown for bar chart
  const statusData = stats.by_status
    ? Object.entries(stats.by_status).map(([status, count], i) => ({
        name: STATUS_LABELS[status] || status,
        value: count,
        fill: STATUS_COLORS[i % STATUS_COLORS.length],
      }))
    : [];

  const isLoading = loadingRevenue || loadingStats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analíticas</h1>
          <p className="mt-0.5 text-sm text-gray-500">Rendimiento de ventas y clientes</p>
        </div>

        {/* Range selector */}
        <div className="flex rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          {RANGE_OPTIONS.map((opt, i) => (
            <button
              key={i}
              onClick={() => setSelectedRange(i)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                selectedRange === i
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={DollarSign}
              label="Ingresos del período"
              value={formatCurrency(totalRevenue)}
              color="indigo"
            />
            <StatCard
              icon={ShoppingCart}
              label="Pedidos"
              value={totalOrders.toLocaleString('es')}
              color="green"
            />
            <StatCard
              icon={TrendingUp}
              label="Productos vendidos"
              value={totalItems.toLocaleString('es')}
              color="yellow"
            />
            <StatCard
              icon={Users}
              label="Total clientes"
              value={(stats.total || 0).toLocaleString('es')}
              sub={`LTV prom: ${formatCurrency(stats.avg_ltv)}`}
              color="blue"
            />
          </div>

          {/* Revenue line chart */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-800">Ingresos por día</h2>
            {chartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Sin datos para este período</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    width={48}
                  />
                  <Tooltip
                    formatter={(v) => [formatCurrency(v), 'Ingresos']}
                    labelStyle={{ fontWeight: 600 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#6366f1' }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Orders bar chart */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-800">Pedidos por día</h2>
            {chartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Sin datos para este período</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} width={32} />
                  <Tooltip formatter={(v) => [v, 'Pedidos']} labelStyle={{ fontWeight: 600 }} />
                  <Bar dataKey="order_count" fill="#22c55e" radius={[4, 4, 0, 0]} name="Pedidos" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Customer charts row */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Tier breakdown */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-gray-800">Clientes por nivel</h2>
              {tierData.every((d) => d.value === 0) ? (
                <p className="py-8 text-center text-sm text-gray-400">Sin clientes registrados</p>
              ) : (
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie
                        data={tierData}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {tierData.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, name) => [v, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="space-y-2">
                    {tierData.map((entry) => (
                      <li key={entry.name} className="flex items-center gap-2 text-sm">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{ background: entry.fill }}
                        />
                        <span className="text-gray-600">{entry.name}</span>
                        <span className="ml-auto font-semibold text-gray-900">{entry.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Pipeline status */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-gray-800">Estado del pipeline</h2>
              {statusData.every((d) => d.value === 0) ? (
                <p className="py-8 text-center text-sm text-gray-400">Sin datos de pipeline</p>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart
                    data={statusData}
                    layout="vertical"
                    margin={{ top: 0, right: 16, bottom: 0, left: 80 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v) => [v, 'Clientes']} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {statusData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
