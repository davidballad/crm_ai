export default function InsightCard({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        {Icon && <Icon className="h-5 w-5 text-brand-600" />}
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}
