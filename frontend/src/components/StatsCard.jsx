export default function StatsCard({ title, value, subtitle, icon: Icon, trend }) {
  return (
    <div className="card flex items-start gap-4">
      {Icon && (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
        {subtitle && (
          <p className={`mt-1 text-xs ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-500'}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
