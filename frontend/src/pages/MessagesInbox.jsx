import { Link } from 'react-router-dom';
import { useMessages } from '../hooks/useMessages';
import { useContacts } from '../hooks/useContacts';
import { MessageSquare } from 'lucide-react';

const CATEGORIES = [
  { id: 'active', label: 'Active', color: 'border-green-400', dot: 'bg-green-500' },
  { id: 'incomplete', label: 'Incomplete', color: 'border-yellow-400', dot: 'bg-yellow-500' },
  { id: 'closed', label: 'Closed', color: 'border-gray-300', dot: 'bg-gray-400' },
];

export default function MessagesInbox() {
  const { data, isLoading, error } = useMessages();
  const { data: contactsData } = useContacts();

  const messages = data?.messages || [];
  const contactsMap = (contactsData?.contacts || []).reduce((acc, c) => {
    acc[c.contact_id] = c;
    return acc;
  }, {});

  const byCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = messages
      .filter((m) => (m.category || 'active') === cat.id)
      .sort((a, b) => new Date(b.created_ts || 0) - new Date(a.created_ts || 0));
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
        <h1 className="text-xl font-bold text-gray-900">Messages</h1>
        <p className="text-sm text-gray-500">WhatsApp conversations by status</p>
      </div>

      {messages.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-600">No messages</p>
          <p className="mt-1 text-sm text-gray-400">Messages from WhatsApp will appear here</p>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              className={`flex w-80 shrink-0 flex-col rounded-xl border-t-4 ${cat.color} border border-gray-200 bg-gray-50/50`}
            >
              <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${cat.dot}`} />
                <h2 className="font-semibold text-gray-900">{cat.label}</h2>
                <span className="ml-auto rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                  {byCategory[cat.id]?.length ?? 0}
                </span>
              </div>
              <div className="flex-1 space-y-2 p-3 min-h-[120px] max-h-[70vh] overflow-y-auto">
                {(byCategory[cat.id] || []).map((m) => {
                  const contact = m.contact_id ? contactsMap[m.contact_id] : null;
                  return (
                    <div
                      key={m.message_id}
                      className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="font-medium text-gray-900 text-sm">
                          {contact?.name || m.from_number}
                        </span>
                        <span>{m.created_ts ? new Date(m.created_ts).toLocaleTimeString() : ''}</span>
                      </div>
                      <p className="mt-1.5 text-sm text-gray-700 line-clamp-2">{m.text}</p>
                      {contact && (
                        <Link
                          to={`/leads/${m.contact_id}`}
                          className="mt-2 inline-block text-xs text-brand-600 hover:underline"
                        >
                          View lead
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
