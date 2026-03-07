import { Link } from 'react-router-dom';
import { useContacts } from '../hooks/useContacts';
import { Users } from 'lucide-react';

const STATUSES = [
  { id: 'prospect', label: 'Prospect', color: 'border-gray-400', dot: 'bg-gray-500' },
  { id: 'interested', label: 'Interested', color: 'border-blue-400', dot: 'bg-blue-500' },
  { id: 'closed_won', label: 'Closed Won', color: 'border-green-400', dot: 'bg-green-500' },
  { id: 'abandoned', label: 'Abandoned', color: 'border-red-400', dot: 'bg-red-500' },
];

const TIER_STYLES = {
  bronze: 'bg-amber-100 text-amber-800',
  silver: 'bg-slate-200 text-slate-700',
  gold: 'bg-yellow-100 text-yellow-800',
};

function TierBadge({ tier }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${TIER_STYLES[tier] || TIER_STYLES.bronze}`}>
      {tier || 'bronze'}
    </span>
  );
}

export default function LeadsList() {
  const { data, isLoading, error } = useContacts();

  const contacts = data?.contacts || [];
  const byStatus = STATUSES.reduce((acc, s) => {
    acc[s.id] = contacts.filter((c) => (c.lead_status || 'prospect') === s.id);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }
  if (error) {
    return <div className="card text-center text-sm text-red-600">{error.message}</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Leads</h1>
        <p className="text-sm text-gray-500">{contacts.length} total</p>
      </div>

      {contacts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Users className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-600">No leads yet</p>
          <p className="mt-1 text-sm text-gray-400">Leads are created automatically from the WhatsApp flow</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUSES.map((status) => (
            <div
              key={status.id}
              className={`flex w-72 shrink-0 flex-col rounded-xl border-t-4 ${status.color} border border-gray-200 bg-gray-50/50`}
            >
              <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />
                <h2 className="font-semibold text-gray-900">{status.label}</h2>
                <span className="ml-auto rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {byStatus[status.id]?.length ?? 0}
                </span>
              </div>
              <div className="flex-1 space-y-2 p-3 min-h-[120px] max-h-[70vh] overflow-y-auto">
                {(byStatus[status.id] || []).map((c) => (
                  <Link
                    key={c.contact_id}
                    to={`/leads/${c.contact_id}`}
                    className="block rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <TierBadge tier={c.tier} />
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{c.phone || c.email || '\u2014'}</p>
                    {c.source_channel && (
                      <p className="mt-1 text-[10px] uppercase text-gray-400">{c.source_channel}</p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
