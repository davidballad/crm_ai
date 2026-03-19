import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { data: productData, isLoading: loadingProducts } = useProducts();
  const { data: summary } = useDailySummary(todayStr());
  const { data: insightData } = useInsights();

  const products = productData?.products || productData?.items || [];
  const lowStockProducts = products.filter((p) => {
    const q = Number(p.quantity);
    const t = Number(p.reorder_threshold ?? 10);
    return !Number.isNaN(q) && !Number.isNaN(t) && q <= t;
  });
  const totalValue = products.reduce(
    (sum, p) => sum + (p.quantity || 0) * Number(p.unit_cost || 0),
    0,
  );

  const insight = insightData?.insight || insightData;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        <p className="text-sm text-gray-500">{t('dashboard.overview')}</p>
      </div>

      {/* Stats row */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title={t('dashboard.totalProducts')}
          value={loadingProducts ? '...' : products.length}
          icon={Package}
        />
        <StatsCard
          title={t('dashboard.inventoryValue')}
          value={`$${totalValue.toFixed(2)}`}
          icon={DollarSign}
        />
        <StatsCard
          title={t('dashboard.todayRevenue')}
          value={`$${Number(summary?.total_revenue || 0).toFixed(2)}`}
          icon={ShoppingCart}
        />
        <StatsCard
          title={t('dashboard.lowStockItems')}
          value={lowStockProducts.length}
          icon={AlertTriangle}
          trend={lowStockProducts.length > 0 ? 'down' : undefined}
          subtitle={lowStockProducts.length > 0 ? t('dashboard.needsAttention') : t('dashboard.allStocked')}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* AI Summary */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-brand-600" />
              <h2 className="text-sm font-semibold text-gray-900">{t('dashboard.aiSummary')}</h2>
            </div>
            <Link to="/app/insights" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              {t('dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {insight?.summary ? (
            <p className="text-sm leading-relaxed text-gray-700">{insight.summary}</p>
          ) : (
            <p className="text-sm text-gray-400">
              {t('dashboard.noInsightsYet')}{' '}
              <Link to="/app/insights" className="text-brand-600 underline">{t('dashboard.insightsPage')}</Link>{' '}
              {t('dashboard.toGenerate')}
            </p>
          )}
        </div>

        {/* Low stock alerts */}
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h2 className="text-sm font-semibold text-gray-900">{t('dashboard.lowStockAlerts')}</h2>
            </div>
            <Link to="/app/inventory" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              {t('dashboard.viewAll')} <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {lowStockProducts.length === 0 ? (
            <p className="text-sm text-gray-400">{t('dashboard.allWellStocked')}</p>
          ) : (
            <div className="space-y-2">
              {lowStockProducts.slice(0, 5).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{p.name}</span>
                    <span className="ml-2 text-xs text-gray-500">{p.quantity} {t('dashboard.remaining')}</span>
                  </div>
                  <LowStockBadge quantity={p.quantity} threshold={p.reorder_threshold ?? 10} />
                </div>
              ))}
              {lowStockProducts.length > 5 && (
                <p className="pt-1 text-xs text-gray-500">
                  +{lowStockProducts.length - 5} {t('dashboard.moreItems')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
