import { Link, useParams } from 'react-router-dom';
import { useContact } from '../hooks/useContacts';
import { useContactMessages } from '../hooks/useContactMessages';
import { ArrowLeft, MessageSquare } from 'lucide-react';

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
  const { data: contact, isLoading, error } = useContact(id);
  const { data: messagesData } = useContactMessages(id);

  const messages = messagesData?.messages || [];

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
        <Link to="/leads" className="mt-3 block text-brand-600 hover:underline">Back to leads</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <Link to="/leads" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{contact.name}</h1>
            <TierBadge tier={contact.tier} />
            <StatusBadge status={contact.lead_status} />
          </div>
          <p className="text-sm text-gray-500">{contact.phone || contact.email || 'No contact info'}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Details</h2>
          <dl className="space-y-3 text-sm">
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
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500">No messages yet.</p>
          ) : (
            <ul className="space-y-3 max-h-96 overflow-y-auto">
              {messages.map((m) => (
                <li
                  key={m.message_id}
                  className={`rounded-lg p-3 text-sm ${
                    m.from_number ? 'ml-4 bg-brand-50 text-gray-900' : 'mr-4 bg-gray-100 text-gray-900'
                  }`}
                >
                  <p>{m.text}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                    <span>{m.created_ts ? new Date(m.created_ts).toLocaleString() : ''}</span>
                    {m.category && (
                      <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] uppercase">
                        {m.category}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
