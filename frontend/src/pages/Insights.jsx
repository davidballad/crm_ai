import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useInsights, useGenerateInsights } from '../hooks/useInsights';
import { usePlan } from '../hooks/useTenantConfig';
import InsightCard from '../components/InsightCard';
import UpgradeWall from '../components/UpgradeWall';
import {
  BrainCircuit,
  TrendingUp,
  Package,
  DollarSign,
  BarChart3,
  RefreshCw,
  Users,
  Filter,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  Cell,
  LabelList,
} from 'recharts';

function formatForecast(f) {
  if (typeof f === 'string') return f;
  const name = f.product_name || f.productName || 'Producto';
  const date = f.estimated_restock_date || f.estimatedRestockDate || '';
  const reason = f.reason || '';
  if (date && reason) return `${name} — ${date}: ${reason}`;
  if (reason) return `${name}: ${reason}`;
  return name || JSON.stringify(f);
}

function formatReorderSuggestion(r) {
  if (typeof r === 'string') return r;
  const name = r.product_name || r.productName || 'Producto';
  const qty = r.suggested_order_quantity ?? r.suggestedOrderQuantity ?? r.quantity;
  const current = r.current_quantity ?? r.currentQuantity;
  const threshold = r.reorder_threshold ?? r.reorderThreshold;
  const reason = r.reason || '';
  let text = name;
  if (qty != null) text += ` — pedir ${qty} unidades`;
  if (current != null && threshold != null) text += ` (actual: ${current}, umbral: ${threshold})`;
  if (reason) text += `. ${reason}`;
  return text || JSON.stringify(r);
}

function truncateLabel(s, max = 26) {
  if (!s || typeof s !== 'string') return '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

const FUNNEL_STAGE_KEYS = ['prospect', 'interested', 'closed_won'];
const FUNNEL_FILLS = ['#8b5cf6', '#6366f1', '#16a34a'];

/** Ordered snapshot funnel: prospect → interested → closed won (current counts per stage). */
function buildFunnelSnapshot(leadsByStatus, translate) {
  const m = leadsByStatus || {};
  return FUNNEL_STAGE_KEYS.map((key, idx) => ({
    stageKey: key,
    name: translate(`insights.funnelStage.${key}`),
    value: Number(m[key]) || 0,
    fill: FUNNEL_FILLS[idx],
  }));
}

/** Stage-size ratios (snapshot only—not cohort conversion). */
function funnelSnapshotRates(rows) {
  const p = rows[0]?.value ?? 0;
  const i = rows[1]?.value ?? 0;
  const c = rows[2]?.value ?? 0;
  return {
    pi: p > 0 ? Math.round((i / p) * 1000) / 10 : null,
    ic: i > 0 ? Math.round((c / i) * 1000) / 10 : null,
    pc: p > 0 ? Math.round((c / p) * 1000) / 10 : null,
  };
}

/** Sorted bar data from { key: count } maps (e.g. leads_by_status). */
function chartEntriesFromMap(obj) {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj)
    .map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: Number(v) || 0 }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

export default function Insights() {
  const { t, i18n } = useTranslation();
  const { isPro, isLoading: planLoading } = usePlan();
  const { data, isLoading, error } = useInsights();
  const generate = useGenerateInsights();

  const insight = data?.insight || data;
  const hasInsight = insight && insight.summary;

  const topProductsData = hasInsight
    ? (insight.top_selling_products || []).slice(0, 8).map((p) => ({
        name: truncateLabel(p.product_name || '', 24),
        revenue: Number(p.revenue) || 0,
      }))
    : [];
  const leadStatusChart = hasInsight ? chartEntriesFromMap(insight.leads_by_status) : [];
  const tierChart = hasInsight ? chartEntriesFromMap(insight.leads_by_tier) : [];
  const topProductsChartHeight = Math.min(400, 48 + Math.max(topProductsData.length, 1) * 36);

  const funnelRows = hasInsight ? buildFunnelSnapshot(insight.leads_by_status, t) : [];
  const funnelTotal = funnelRows.reduce((s, r) => s + r.value, 0);
  const abandonedCount = hasInsight ? Number((insight.leads_by_status || {}).abandoned) || 0 : 0;
  const showFunnelSnapshot = hasInsight && (funnelTotal > 0 || abandonedCount > 0);
  const funnelRates = showFunnelSnapshot ? funnelSnapshotRates(funnelRows) : null;

  const handleGenerate = () => generate.mutate({ language: i18n.language || 'en' });

  const dayKeyToSpanishShort = {
    Monday: 'Lun',
    Tuesday: 'Mar',
    Wednesday: 'Mie',
    Thursday: 'Jue',
    Friday: 'Vie',
    Saturday: 'Sab',
    Sunday: 'Dom',
  };

  useEffect(() => {
    document.title = `${t('insights.title')} | Clienta AI`;
    return () => { document.title = 'Clienta AI'; };
  }, [t, i18n.language]);

  if (planLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!isPro) {
    return <UpgradeWall featureKey="aiInsights" />;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('insights.title')}</h1>
          <p className="text-sm text-gray-500">{t('insights.subtitle')}</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generate.isPending}
          className="btn-primary gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${generate.isPending ? 'animate-spin' : ''}`} />
          {generate.isPending ? t('insights.generating') : t('insights.generate')}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : error && !hasInsight ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <BrainCircuit className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-600">{t('insights.noInsightsYet')}</p>
          <p className="mt-1 text-sm text-gray-400">
            {t('insights.clickGenerate')}
          </p>
        </div>
      ) : hasInsight ? (
        <div className="space-y-6">
          {/* Summary */}
          <InsightCard title={t('insights.businessSummary')} icon={BrainCircuit} className="bg-gradient-to-br from-brand-50 to-white">
            <p className="text-base leading-relaxed">{insight.summary}</p>
            {insight.generated_at && (
              <p className="mt-3 text-xs text-gray-400">
                {t('insights.generated')} {new Date(insight.generated_at).toLocaleString()}
              </p>
            )}
          </InsightCard>

          {insight.lead_insights?.length > 0 && (
            <InsightCard title={t('insights.leadInsights')} icon={Users}>
              <ul className="space-y-2">
                {insight.lead_insights.map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                    <span>{typeof line === 'string' ? line : JSON.stringify(line)}</span>
                  </li>
                ))}
              </ul>
            </InsightCard>
          )}

          {showFunnelSnapshot && (
            <InsightCard title={t('insights.funnelSnapshot')} icon={Filter}>
              <p className="mb-3 text-xs text-gray-500">{t('insights.funnelDisclaimer')}</p>
              {funnelTotal > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <FunnelChart margin={{ top: 8, right: 48, bottom: 8, left: 8 }}>
                      <Tooltip formatter={(v) => [v, t('insights.funnelContacts')]} />
                      <Funnel dataKey="value" data={funnelRows} isAnimationActive>
                        {funnelRows.map((entry, index) => (
                          <Cell key={entry.stageKey} fill={entry.fill || FUNNEL_FILLS[index]} />
                        ))}
                        <LabelList position="right" fill="#374151" stroke="none" dataKey="name" />
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                  {funnelRates && (funnelRates.pi != null || funnelRates.ic != null || funnelRates.pc != null) && (
                    <p className="mt-3 text-sm text-gray-600">
                      {[
                        funnelRates.pi != null && t('insights.funnelRatePI', { pct: funnelRates.pi }),
                        funnelRates.ic != null && t('insights.funnelRateIC', { pct: funnelRates.ic }),
                        funnelRates.pc != null && t('insights.funnelRatePC', { pct: funnelRates.pc }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-600">{t('insights.funnelNoPipeline')}</p>
              )}
              {abandonedCount > 0 && (
                <p className={`text-sm text-gray-600 ${funnelTotal > 0 ? 'mt-2' : ''}`}>
                  {t('insights.funnelAbandoned', { count: abandonedCount })}
                </p>
              )}
            </InsightCard>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Demand forecasts */}
            {insight.forecasts?.length > 0 && (
              <InsightCard title={t('insights.demandForecasts')} icon={TrendingUp}>
                <ul className="space-y-2">
                  {insight.forecasts.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      <span>
                        {typeof f === 'string'
                          ? f
                          : formatForecast(f)}
                      </span>
                    </li>
                  ))}
                </ul>
              </InsightCard>
            )}

            {/* Reorder suggestions */}
            {insight.reorder_suggestions?.length > 0 && (
              <InsightCard title={t('insights.reorderSuggestions')} icon={Package}>
                <ul className="space-y-2">
                  {insight.reorder_suggestions.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span>
                        {typeof r === 'string' ? r : formatReorderSuggestion(r)}
                      </span>
                    </li>
                  ))}
                </ul>
              </InsightCard>
            )}

            {/* Spending trends */}
            {insight.spending_trends?.length > 0 && (
              <InsightCard title={t('insights.spendingTrends')} icon={DollarSign}>
                <ul className="space-y-2">
                  {insight.spending_trends.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                      <span>{typeof s === 'string' ? s : (s.description || s.reason || JSON.stringify(s))}</span>
                    </li>
                  ))}
                </ul>
              </InsightCard>
            )}

            {/* Revenue by day (chart from backend data) */}
            {insight.revenue_by_day_of_week && Object.keys(insight.revenue_by_day_of_week).length > 0 && (
              <InsightCard title={t('insights.revenueByDay')} icon={BarChart3}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({
                      day: dayKeyToSpanishShort[day] || day.slice(0, 3),
                      revenue: Number(insight.revenue_by_day_of_week?.[day]) || 0,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Ingresos']} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Ingresos" />
                  </BarChart>
                </ResponsiveContainer>
              </InsightCard>
            )}

            {topProductsData.length > 0 && (
              <InsightCard title={t('insights.topProducts')} icon={BarChart3}>
                <ResponsiveContainer width="100%" height={topProductsChartHeight}>
                  <BarChart layout="vertical" data={topProductsData} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Ingresos']} />
                    <Bar dataKey="revenue" fill="#0d9488" radius={[0, 4, 4, 0]} name="Ingresos" />
                  </BarChart>
                </ResponsiveContainer>
              </InsightCard>
            )}

            {leadStatusChart.length > 0 && (
              <InsightCard title={t('insights.leadPipeline')} icon={Users}>
                <ResponsiveContainer width="100%" height={Math.max(200, 40 + leadStatusChart.length * 40)}>
                  <BarChart data={leadStatusChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} height={56} textAnchor="end" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [value, 'Contactos']} />
                    <Bar dataKey="value" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Contactos" />
                  </BarChart>
                </ResponsiveContainer>
              </InsightCard>
            )}

            {tierChart.length > 0 && (
              <InsightCard title={t('insights.leadTiers')} icon={Users}>
                <ResponsiveContainer width="100%" height={Math.max(200, 40 + tierChart.length * 40)}>
                  <BarChart data={tierChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [value, 'Contactos']} />
                    <Bar dataKey="value" fill="#d97706" radius={[4, 4, 0, 0]} name="Contactos" />
                  </BarChart>
                </ResponsiveContainer>
              </InsightCard>
            )}

            {/* Revenue insights (AI bullet points) */}
            {insight.revenue_insights?.length > 0 && (
              <InsightCard title={t('insights.revenueInsights')} icon={BarChart3}>
                <ul className="space-y-2">
                  {insight.revenue_insights.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      <span>{typeof r === 'string' ? r : r.description || JSON.stringify(r)}</span>
                    </li>
                  ))}
                </ul>
              </InsightCard>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
