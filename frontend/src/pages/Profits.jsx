import { useState } from 'react';
import { useProfitsSummary } from '../hooks/useProfits';
import ProfitsOverview from '../components/ProfitsOverview';

const PERIODS = [
  { value: 'this-month', label: 'Este Mes' },
  { value: 'last-month', label: 'Mes Pasado' },
  { value: 'this-year', label: 'Este Año' },
  { value: 'all-time', label: 'Todo' },
];

export default function Profits() {
  const [period, setPeriod] = useState('this-month');
  const { data: summary, isLoading, error } = useProfitsSummary(period);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ganancias y Analíticas</h1>
        <p className="mt-1 text-sm text-gray-500">
          Visualiza tus márgenes, costos y rentabilidad por período.
        </p>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPeriod(value)}
            className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
              period === value
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Error cargando datos de ganancias.
        </div>
      )}

      {/* Overview tab with supplier breakdown */}
      <ProfitsOverview summary={summary} loading={isLoading} />
    </div>
  );
}
