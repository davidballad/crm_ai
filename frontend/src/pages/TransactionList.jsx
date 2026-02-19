import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTransactions, useDailySummary } from '../hooks/useTransactions';
import StatsCard from '../components/StatsCard';
import { Plus, ShoppingCart, DollarSign, Receipt, CreditCard } from 'lucide-react';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function TransactionList() {
  const [dateRange] = useState({});
  const { data, isLoading, error } = useTransactions(dateRange);
  const { data: summary } = useDailySummary(todayStr());

  const transactions = data?.transactions || data?.items || [];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Transactions</h1>
          <p className="text-sm text-gray-500">Sales history and daily overview</p>
        </div>
        <Link to="/transactions/new" className="btn-primary gap-2">
          <Plus className="h-4 w-4" /> Record sale
        </Link>
      </div>

      {/* Daily summary cards */}
      {summary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Today's revenue"
            value={`$${Number(summary.total_revenue || 0).toFixed(2)}`}
            icon={DollarSign}
          />
          <StatsCard
            title="Transactions"
            value={summary.transaction_count || 0}
            icon={Receipt}
          />
          <StatsCard
            title="Items sold"
            value={summary.items_sold || 0}
            icon={ShoppingCart}
          />
          <StatsCard
            title="Avg. sale"
            value={
              summary.transaction_count
                ? `$${(Number(summary.total_revenue || 0) / summary.transaction_count).toFixed(2)}`
                : '$0.00'
            }
            icon={CreditCard}
          />
        </div>
      )}

      {/* Transaction list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="card text-center text-sm text-red-600">{error.message}</div>
      ) : transactions.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Receipt className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-600">No transactions yet</p>
          <p className="mt-1 text-sm text-gray-400">Record your first sale to see it here</p>
          <Link to="/transactions/new" className="btn-primary mt-4 gap-2">
            <Plus className="h-4 w-4" /> Record sale
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((t, i) => (
                <tr key={t.id || i} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {t.created_at ? new Date(t.created_at).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {(t.items || []).map((item) => (
                      <span key={item.product_id} className="mr-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs">
                        {item.product_name} x{item.quantity}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    ${Number(t.total || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-700">
                      {t.payment_method}
                    </span>
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-gray-500">{t.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
