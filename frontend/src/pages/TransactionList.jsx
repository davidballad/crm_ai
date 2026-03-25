import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useTransactions, useDailySummary } from '../hooks/useTransactions';
import { patchTransaction, fetchTransaction, cancelTransaction } from '../api/transactions';
import { sendMessage } from '../api/messages';
import StatsCard from '../components/StatsCard';
import { ShoppingCart, DollarSign, Receipt, CreditCard } from 'lucide-react';

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function TransactionList() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('today');
  const [filters, setFilters] = useState({
    startDate: todayStr(),
    endDate: todayStr(),
  });
  const [historyStart, setHistoryStart] = useState('');
  const [historyEnd, setHistoryEnd] = useState('');
  const [selectedTx, setSelectedTx] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('clienta-notification-sound') === 'true';
  });
  const knownProofTxIdsRef = useRef(new Set());
  const notificationInitRef = useRef(false);

  const { data, isLoading, error } = useTransactions(filters, {
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });
  const { data: summary } = useDailySummary(todayStr());

  const transactions = data?.transactions || data?.items || [];

  const playAlertTone = () => {
    if (!soundEnabled || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.3);
      oscillator.onended = () => ctx.close().catch(() => {});
    } catch {
      // Best effort only; browser may block audio until explicit user interaction.
    }
  };

  const sendBrowserNotification = (tx) => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    const ref = tx.payment_reference || tx.id || 'order';
    const total = Number(tx.total || 0).toFixed(2);
    const body = `Transfer screenshot received (${ref}) - Total: $${total}`;
    try {
      const n = new Notification('New payment proof to verify', { body });
      n.onclick = () => {
        window.focus();
        openVerification(tx);
      };
    } catch {
      // Ignore notification failures on restricted browsers.
    }
  };

  const enableBrowserNotifications = async () => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    try {
      await Notification.requestPermission();
    } catch {
      // Ignore prompt errors on unsupported browser contexts.
    }
  };

  const openVerification = async (tx) => {
    if (!tx?.id) return;
    setDetailsError('');
    setVerifyError('');
    setDetailsLoading(true);
    try {
      const full = await fetchTransaction(tx.id);
      setSelectedTx(full);
    } catch (err) {
      setDetailsError(err.message || 'Failed to load transaction details');
      setSelectedTx(tx);
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeVerification = () => {
    setSelectedTx(null);
    setDetailsError('');
    setVerifyError('');
    setCancelError('');
  };

  const handleVerify = async () => {
    if (!selectedTx?.id) return;
    setVerifyError('');
    setVerifyLoading(true);
    try {
      const updated = await patchTransaction(selectedTx.id, { payment_verification_status: 'verified' });
      setSelectedTx(updated);
      if (selectedTx.customer_phone) {
        await sendMessage({
          to_number: selectedTx.customer_phone,
          text: t('transactions.orderVerifiedMessage'),
        });
      }
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    } catch (err) {
      setVerifyError(err.message || 'Failed to verify payment');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleCancelTransaction = async () => {
    if (!selectedTx?.id) return;
    const confirmed = window.confirm(
      'Cancel this transaction? This will remove it from history and restore inventory quantities.',
    );
    if (!confirmed) return;
    setCancelError('');
    setCancelLoading(true);
    try {
      await cancelTransaction(selectedTx.id);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['daily-summary'] });
      closeVerification();
    } catch (err) {
      setCancelError(err.message || 'Failed to cancel transaction');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleCancelFromRow = async (tx) => {
    if (!tx?.id) return;
    const confirmed = window.confirm(
      t('transactions.cancelConfirm'),
    );
    if (!confirmed) return;
    try {
      await cancelTransaction(tx.id);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['daily-summary'] });
    } catch (err) {
      setCancelError(err.message || t('transactions.cancelFailed'));
    }
  };

  const verificationTag = (tx) => {
    const status = tx.payment_verification_status || 'awaiting_verification';
    if (status === 'verified') {
      return <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Verified</span>;
    }
    return <span className="inline-flex rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">Waiting for verification</span>;
  };

  useEffect(() => {
    const syncTodayIfNeeded = () => {
      if (activeTab !== 'today') return;
      const today = todayStr();
      if (filters.startDate !== today || filters.endDate !== today) {
        setFilters({ startDate: today, endDate: today });
      }
    };

    syncTodayIfNeeded();
    window.addEventListener('focus', syncTodayIfNeeded);
    document.addEventListener('visibilitychange', syncTodayIfNeeded);
    return () => {
      window.removeEventListener('focus', syncTodayIfNeeded);
      document.removeEventListener('visibilitychange', syncTodayIfNeeded);
    };
  }, [activeTab, filters.startDate, filters.endDate]);

  useEffect(() => {
    const pendingProofTx = transactions.filter(
      (tx) => tx?.id && tx?.has_payment_proof && tx?.payment_verification_status !== 'verified',
    );
    const currentIds = new Set(pendingProofTx.map((tx) => tx.id));

    if (!notificationInitRef.current) {
      knownProofTxIdsRef.current = currentIds;
      notificationInitRef.current = true;
      return;
    }

    pendingProofTx.forEach((tx) => {
      if (!knownProofTxIdsRef.current.has(tx.id)) {
        sendBrowserNotification(tx);
        playAlertTone();
      }
    });

    currentIds.forEach((id) => knownProofTxIdsRef.current.add(id));
  }, [transactions]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('clienta-notification-sound', soundEnabled ? 'true' : 'false');
  }, [soundEnabled]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">{t('transactions.title')}</h1>
        <p className="text-sm text-gray-500">{t('transactions.subtitle')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-brand-200 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
            onClick={enableBrowserNotifications}
          >
            {typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
              ? 'Browser alerts enabled'
              : 'Enable browser alerts'}
          </button>
          <button
            type="button"
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              soundEnabled
                ? 'border-green-200 text-green-700 hover:bg-green-50'
                : 'border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
            onClick={() => {
              setSoundEnabled((prev) => !prev);
              if (!soundEnabled) playAlertTone();
            }}
          >
            {soundEnabled ? 'Sound alert: on' : 'Sound alert: off'}
          </button>
          <p className="text-xs text-gray-500">
            Live checks run every 15s while this page is open.
          </p>
        </div>
      </div>

      {/* Date range tabs */}
      <div className="mb-4 border-b border-gray-200">
        <nav className="-mb-px flex space-x-4" aria-label="Tabs">
          <button
            type="button"
            onClick={() => {
              setActiveTab('today');
              const today = todayStr();
              setFilters({ startDate: today, endDate: today });
            }}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === 'today'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t('transactions.today')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              activeTab === 'history'
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t('transactions.previousDays')}
          </button>
        </nav>
      </div>

      {activeTab === 'history' && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex flex-col">
            <label htmlFor="start-date" className="text-xs font-medium text-gray-500">
              {t('transactions.startDate')}
            </label>
            <input
              id="start-date"
              type="date"
              className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={historyStart}
              onChange={(e) => setHistoryStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label htmlFor="end-date" className="text-xs font-medium text-gray-500">
              {t('transactions.endDate')}
            </label>
            <input
              id="end-date"
              type="date"
              className="mt-1 rounded-md border border-gray-300 px-2 py-1 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={historyEnd}
              onChange={(e) => setHistoryEnd(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() =>
              setFilters({
                startDate: historyStart || undefined,
                endDate: historyEnd || undefined,
              })
            }
            className="btn-primary px-4 py-2 text-sm"
          >
            {t('transactions.apply')}
          </button>
        </div>
      )}

      {/* Daily summary cards */}
      {summary && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title={t('transactions.todayRevenue')}
            value={`$${Number(summary.total_revenue || 0).toFixed(2)}`}
            icon={DollarSign}
          />
          <StatsCard
            title={t('transactions.transactionCount')}
            value={summary.transaction_count || 0}
            icon={Receipt}
          />
          <StatsCard
            title={t('transactions.itemsSold')}
            value={summary.items_sold || 0}
            icon={ShoppingCart}
          />
          <StatsCard
            title={t('transactions.avgSale')}
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
          <p className="mt-1 text-sm text-gray-400">Transactions are created when orders are completed via WhatsApp</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">{t('transactions.date')}</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">{t('transactions.items')}</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">{t('transactions.total')}</th>
                <th className="px-4 py-3">{t('transactions.payment')}</th>
                <th className="px-4 py-3">Payment verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {transactions.map((tx, i) => (
                <tr key={tx.id || i} className="hover:bg-gray-50 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                    {tx.created_at ? new Date(tx.created_at).toLocaleString() : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-gray-700">
                    {tx.payment_reference || tx.id || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {(tx.items || []).map((item) => (
                      <span key={item.product_id} className="mr-2 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs">
                        {item.product_name} x{item.quantity}
                      </span>
                    ))}
                  </td>
                  <td className="max-w-[240px] px-4 py-3 text-xs text-gray-600">
                    <span className="line-clamp-2">{tx.order_notes || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    ${Number(tx.total || 0).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium capitalize text-gray-700">
                      {tx.payment_method}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded focus:outline-none focus:ring-2 focus:ring-brand-500"
                        onClick={() => openVerification(tx)}
                      >
                        {verificationTag(tx)}
                      </button>
                      {tx.payment_verification_status !== 'verified' && (
                        <button
                          type="button"
                          className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                          onClick={() => handleCancelFromRow(tx)}
                        >
                          {t('transactions.cancelOrder')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h3 className="text-base font-semibold text-gray-900">Payment verification</h3>
              <button type="button" onClick={closeVerification} className="text-sm text-gray-500 hover:text-gray-700">
                Close
              </button>
            </div>
            <div className="space-y-3 px-4 py-4">
              {detailsLoading && <p className="text-sm text-gray-500">Loading transaction details...</p>}
              {detailsError && <p className="text-sm text-red-600">{detailsError}</p>}
              <div className="text-sm text-gray-700">
                <p><span className="font-medium">Reference:</span> {selectedTx.payment_reference || selectedTx.id || '—'}</p>
                <p><span className="font-medium">Customer phone:</span> {selectedTx.customer_phone || '—'}</p>
                <p><span className="font-medium">Total:</span> ${Number(selectedTx.total || 0).toFixed(2)}</p>
                <p><span className="font-medium">Notes:</span> {selectedTx.order_notes || '—'}</p>
              </div>
              {selectedTx.payment_proof_url ? (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <img src={selectedTx.payment_proof_url} alt="Payment proof" className="max-h-[420px] w-full object-contain bg-gray-50" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">
                  Waiting for customer transfer screenshot.
                </div>
              )}
              {verifyError && <p className="text-sm text-red-600">{verifyError}</p>}
              {cancelError && <p className="text-sm text-red-600">{cancelError}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
              <button
                type="button"
                className="rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleCancelTransaction}
                disabled={verifyLoading || cancelLoading}
              >
                {cancelLoading ? 'Canceling...' : 'Cancel transaction'}
              </button>
              <button type="button" className="btn-secondary" onClick={closeVerification}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleVerify}
                disabled={verifyLoading || selectedTx.payment_verification_status === 'verified'}
              >
                {selectedTx.payment_verification_status === 'verified'
                  ? 'Verified'
                  : verifyLoading
                    ? 'Verifying...'
                    : 'Mark verified'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
