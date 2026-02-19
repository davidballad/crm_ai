import { AlertTriangle } from 'lucide-react';

export default function LowStockBadge({ quantity, threshold }) {
  if (quantity > threshold) return null;

  const critical = quantity === 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        critical
          ? 'bg-red-100 text-red-700'
          : 'bg-amber-100 text-amber-700'
      }`}
    >
      <AlertTriangle className="h-3 w-3" />
      {critical ? 'Out of stock' : 'Low stock'}
    </span>
  );
}
