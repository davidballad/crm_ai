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
                      <span>{typeof f === 'string' ? f : f.description || JSON.stringify(f)}</span>
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
                      <span>{typeof r === 'string' ? r : r.description || `${r.product}: order ${r.quantity} units`}</span>
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
                      <span>{typeof s === 'string' ? s : s.description || JSON.stringify(s)}</span>
                    </li>
                  ))}
                </ul>
              </InsightCard>
            )}

            {/* Revenue insights */}
            {insight.revenue_insights?.length > 0 && (
              <InsightCard title="Revenue Insights" icon={BarChart3}>
                {/* Render chart if data is structured, else bullet list */}
                {insight.revenue_insights.every((r) => r.day && r.revenue) ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={insight.revenue_insights}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ul className="space-y-2">
                    {insight.revenue_insights.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                        <span>{typeof r === 'string' ? r : r.description || JSON.stringify(r)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </InsightCard>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
