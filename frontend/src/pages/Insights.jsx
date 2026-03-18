import { useInsights, useGenerateInsights } from '../hooks/useInsights';
import InsightCard from '../components/InsightCard';
import {
  BrainCircuit,
  TrendingUp,
  Package,
  DollarSign,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function formatForecast(f) {
  if (typeof f === 'string') return f;
  const name = f.product_name || f.productName || 'Product';
  const date = f.estimated_restock_date || f.estimatedRestockDate || '';
  const reason = f.reason || '';
  if (date && reason) return `${name} — ${date}: ${reason}`;
  if (reason) return `${name}: ${reason}`;
  return name || JSON.stringify(f);
}

function formatReorderSuggestion(r) {
  if (typeof r === 'string') return r;
  const name = r.product_name || r.productName || 'Product';
  const qty = r.suggested_order_quantity ?? r.suggestedOrderQuantity ?? r.quantity;
  const current = r.current_quantity ?? r.currentQuantity;
  const threshold = r.reorder_threshold ?? r.reorderThreshold;
  const reason = r.reason || '';
  let text = name;
  if (qty != null) text += ` — order ${qty} units`;
  if (current != null && threshold != null) text += ` (current: ${current}, threshold: ${threshold})`;
  if (reason) text += `. ${reason}`;
  return text || JSON.stringify(r);
}

export default function Insights() {
  const { data, isLoading, error } = useInsights();
  const generate = useGenerateInsights();

  const insight = data?.insight || data;
  const hasInsight = insight && insight.summary;

  const handleGenerate = () => generate.mutate();

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">AI Insights</h1>
          <p className="text-sm text-gray-500">AI-powered analysis of your business data</p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generate.isPending}
          className="btn-primary gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${generate.isPending ? 'animate-spin' : ''}`} />
          {generate.isPending ? 'Generating...' : 'Generate insights'}
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : error && !hasInsight ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <BrainCircuit className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-600">No insights available yet</p>
          <p className="mt-1 text-sm text-gray-400">
            Click &ldquo;Generate insights&rdquo; to analyze your business data with AI
          </p>
        </div>
      ) : hasInsight ? (
        <div className="space-y-6">
          {/* Summary */}
          <InsightCard title="Business Summary" icon={BrainCircuit} className="bg-gradient-to-br from-brand-50 to-white">
            <p className="text-base leading-relaxed">{insight.summary}</p>
            {insight.generated_at && (
              <p className="mt-3 text-xs text-gray-400">
                Generated {new Date(insight.generated_at).toLocaleString()}
              </p>
            )}
          </InsightCard>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Demand forecasts */}
            {insight.forecasts?.length > 0 && (
              <InsightCard title="Demand Forecasts" icon={TrendingUp}>
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
              <InsightCard title="Reorder Suggestions" icon={Package}>
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
              <InsightCard title="Spending Trends" icon={DollarSign}>
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
              <InsightCard title="Revenue by day of week" icon={BarChart3}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => ({
                      day: day.slice(0, 3),
                      revenue: Number(insight.revenue_by_day_of_week?.[day]) || 0,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Revenue']} />
                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              </InsightCard>
            )}

            {/* Revenue insights (AI bullet points) */}
            {insight.revenue_insights?.length > 0 && (
              <InsightCard title="Revenue Insights" icon={BarChart3}>
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
