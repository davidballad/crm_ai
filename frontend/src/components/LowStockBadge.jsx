import { AlertTriangle } from 'lucide-react';

export default function LowStockBadge({ quantity, threshold }) {
  const q = Number(quantity);
  const t = Number(threshold);
  if (Number.isNaN(q) || Number.isNaN(t) || q > t) return null;

  const critical = q === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        critical
          ? 'bg-red-100 text-red-700'
          : 'bg-amber-100 text-amber-700'
      }`}
    >
      <AlertTriangle className="h-3 w-3" />
      {critical ? 'Sin stock' : 'Stock bajo'}
    </span>
  );
}
