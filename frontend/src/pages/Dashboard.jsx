import { Link } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useDailySummary } from '../hooks/useTransactions';
import { useInsights } from '../hooks/useInsights';
import StatsCard from '../components/StatsCard';
import LowStockBadge from '../components/LowStockBadge';
import {
  Package,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  BrainCircuit,
  ArrowRight,
} from 'lucide-react';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { data: productData, isLoading: loadingProducts } = useProducts();
  const { data: summary } = useDailySummary(todayStr());
  const { data: insightData } = useInsights();

  const products = productData?.products || productData?.items || [];
  const lowStockProducts = products.filter(
    (p) => p.quantity <= (p.reorder_threshold ?? 10),
  );
  const totalValue = products.reduce(
    (sum, p) => sum + (p.quantity || 0) * Number(p.unit_cost || 0),
    0,
  );

  const insight = insightData?.insight || insightData;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Overview of your business today</p>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Total products"
          value={loadingProducts ? '...' : products.length}
          icon={Package}
        />
        <StatsCard
          title="Inventory value"
          value={`$${totalValue.toFixed(2)}`}
          icon={DollarSign}
        />
        <StatsCard
          title="Today's revenue"
          value={`$${Number(summary?.total_revenue || 0).toFixed(2)}`}
          icon={ShoppingCart}
        />
        <StatsCard
          title="Low stock items"
          value={lowStockProducts.length}
          icon={AlertTriangle}
          trend={lowStockProducts.length > 0 ? 'down' : undefined}
          subtitle={lowStockProducts.length > 0 ? 'Needs attention' : 'All stocked'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI Summary */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-brand-600" />
              <h2 className="text-sm font-semibold text-gray-900">AI Summary</h2>
            </div>
            <Link to="/insights" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {insight?.summary ? (
            <p className="text-sm leading-relaxed text-gray-700">{insight.summary}</p>
          ) : (
            <p className="text-sm text-gray-400">
              No AI insights generated yet. Visit the{' '}
              <Link to="/insights" className="text-brand-600 underline">Insights page</Link>{' '}
              to generate them.
            </p>
          )}
        </div>

        {/* Low stock alerts */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-900">Low Stock Alerts</h2>
            </div>
            <Link to="/inventory" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {lowStockProducts.length === 0 ? (
            <p className="text-sm text-gray-400">All products are well-stocked.</p>
          ) : (
            <div className="space-y-2">
              {lowStockProducts.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{p.quantity} remaining</span>
                  </div>
                  <LowStockBadge quantity={p.quantity} threshold={p.reorder_threshold ?? 10} />
                </div>
              ))}
              {lowStockProducts.length > 5 && (
                <p className="pt-1 text-xs text-gray-500">
                  +{lowStockProducts.length - 5} more items
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
