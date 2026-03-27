import { Link, useParams } from 'react-router-dom';
import { useContact, usePatchContact } from '../hooks/useContacts';
import { useContactMessages } from '../hooks/useContactMessages';
import { usePlan } from '../hooks/useTenantConfig';
import UpgradeWall from '../components/UpgradeWall';
import { ArrowLeft, MessageSquare } from 'lucide-react';

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const LEAD_STATUS_OPTIONS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'interested', label: 'Interested' },
  { value: 'closed_won', label: 'Closed Won' },
  { value: 'abandoned', label: 'Abandoned' },
];

const TIER_OPTIONS = [
  { value: 'bronze', label: 'Bronze' },
  { value: 'silver', label: 'Silver' },
  { value: 'gold', label: 'Gold' },
];

function formatCurrency(value) {
  if (value == null || value === '') return '\u2014';
  const n = Number(value);
  if (Number.isNaN(n)) return '\u2014';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

const STATUS_COLORS = {
  prospect: 'bg-gray-100 text-gray-700',
  interested: 'bg-blue-100 text-blue-700',
  closed_won: 'bg-green-100 text-green-700',
  abandoned: 'bg-red-100 text-red-700',
};

const TIER_COLORS = {
  bronze: 'bg-amber-100 text-amber-800',
  silver: 'bg-slate-200 text-slate-700',
  gold: 'bg-yellow-100 text-yellow-800',
};

function StatusBadge({ status }) {
  const label = (status || 'prospect').replace('_', ' ');
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[status] || STATUS_COLORS.prospect}`}>
      {label}
    </span>
  );
}

function TierBadge({ tier }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${TIER_COLORS[tier] || TIER_COLORS.bronze}`}>
      {tier || 'bronze'}
    </span>
  );
}

export default function LeadProfile() {
  const { id } = useParams();
  const { isPro, isLoading: planLoading } = usePlan();
  const { data: contact, isLoading, error } = useContact(id);
  const {
    data: messagesData,
    isLoading: messagesLoading,
    isFetching: messagesFetching,
  } = useContactMessages(id);
  const patchContact = usePatchContact();

  if (planLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!isPro) return <UpgradeWall featureKey="leads" />;

  const messages = messagesData?.messages || [];
  const PREVIEW_COUNT = 8;
  const previewMessages = messages.slice(-PREVIEW_COUNT);
  const contactDigits = normalizePhone(contact?.phone);

  const getMessageText = (m) => {
    const t =
      m?.text ??
      m?.message_text ??
      m?.metadata?.text ??
      m?.metadata?.message_text ??
      m?.metadata?.message ??
      m?.metadata?.body ??
      m?.metadata?.caption ??
      m?.body ??
      '';
    return t != null && t !== undefined ? (typeof t === 'string' ? t : String(t)) : '';
  };

  /** Inbound = customer (left); outbound = business (right). */
  const messageIsInbound = (m) => {
    const dir = (m.direction || '').toLowerCase();
    if (dir === 'inbound') return true;
    if (dir === 'outbound') return false;
    if (contactDigits) {
      const from = normalizePhone(m.from_number);
      const to = normalizePhone(m.to_number);
      if (from === contactDigits) return true;
      if (to === contactDigits) return false;
    }
    return true;
  };

  const handleStatusChange = (e) => {
    const lead_status = e.target.value;
    if (!id || !lead_status) return;
    patchContact.mutate({ id, data: { lead_status } });
  };

  const handleTierChange = (e) => {
    const tier = e.target.value;
    if (!id || !tier) return;
    patchContact.mutate({ id, data: { tier } });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }
  if (error || !contact) {
    return (
      <div className="card text-center text-sm text-red-600">
        {error?.message || 'Lead not found'}
        <Link to="/app/leads" className="mt-3 block text-brand-600 hover:underline">Back to leads</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link to="/app/leads" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">{contact.name}</h1>
          <p className="text-sm text-gray-500">{contact.phone || contact.email || 'No contact info'}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Status</span>
              <select
                value={contact.lead_status || 'prospect'}
                onChange={handleStatusChange}
                disabled={patchContact.isPending}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
              >
                {LEAD_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Tier</span>
              <select
                value={contact.tier || 'bronze'}
                onChange={handleTierChange}
                disabled={patchContact.isPending}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
              >
                {TIER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Details</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-500">Total spent</dt>
              <dd className="font-medium text-gray-900">{formatCurrency(contact.total_spent)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Phone</dt>
              <dd className="font-medium text-gray-900">{contact.phone || '\u2014'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Email</dt>
              <dd className="font-medium text-gray-900">{contact.email || '\u2014'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Source</dt>
              <dd className="font-medium text-gray-900">{contact.source_channel || '\u2014'}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Last activity</dt>
              <dd className="font-medium text-gray-900">
                {contact.last_activity_ts ? new Date(contact.last_activity_ts).toLocaleString() : '\u2014'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <MessageSquare className="h-4 w-4" /> Conversation history
          </h2>
          {(messagesLoading || messagesFetching) && messages.length === 0 ? (
            <div className="flex justify-center py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
            </div>
          ) : !messagesLoading && !messagesFetching && messages.length === 0 ? (
            <p className="text-sm text-gray-500">No messages yet.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-gray-500">
                Showing last {Math.min(PREVIEW_COUNT, messages.length)} message(s).
              </p>
              <ul className="max-h-96 space-y-3 overflow-y-auto">
                {previewMessages.map((m, idx) => {
                  const inbound = messageIsInbound(m);
                  return (
                    <li
                      key={m.message_id || `m-${idx}-${m.created_ts || ''}`}
                      className={`rounded-lg p-3 text-sm ${
                        inbound ? 'ml-4 bg-gray-100 text-gray-900' : 'mr-4 bg-brand-50 text-gray-900'
                      }`}
                    >
                      <p>{getMessageText(m)}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <span>{m.created_ts ? new Date(m.created_ts).toLocaleString() : ''}</span>
                        {m.category && (
                          <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] uppercase">
                            {m.category}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
