import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useMessages } from '../hooks/useMessages';
import { useContacts } from '../hooks/useContacts';
import { sendMessage } from '../api/messages';
import { MessageSquare, Send, ArrowLeft } from 'lucide-react';

const CATEGORIES = [
  { id: 'active', label: 'Active', color: 'border-green-400', dot: 'bg-green-500' },
  { id: 'incomplete', label: 'Incomplete', color: 'border-yellow-400', dot: 'bg-yellow-500' },
  { id: 'closed', label: 'Closed', color: 'border-gray-300', dot: 'bg-gray-400' },
];

export default function MessagesInbox() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useMessages();
  const { data: contactsData } = useContacts();
  const [selectedConv, setSelectedConv] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const messages = data?.messages || [];
  const contacts = contactsData?.contacts || [];
  const contactsMap = contacts.reduce((acc, c) => {
    acc[c.contact_id] = c;
    return acc;
  }, {});
  const contactByPhone = contacts.reduce((acc, c) => {
    if (c.phone) acc[c.phone.replace(/\s/g, '')] = c;
    return acc;
  }, {});

  // One chat per number: group by from_number, keep latest message per conversation
  const byNumber = messages.reduce((acc, m) => {
    const num = (m.from_number || '').replace(/\s/g, '') || '_unknown';
    if (!acc[num]) acc[num] = [];
    acc[num].push(m);
    return acc;
  }, {});
  const conversations = Object.entries(byNumber).map(([num, msgs]) => {
    const sorted = [...msgs].sort((a, b) => new Date(b.created_ts || 0) - new Date(a.created_ts || 0));
    const latest = sorted[0];
    const contact = contactByPhone[num] || (latest?.contact_id ? contactsMap[latest.contact_id] : null);
    return {
      from_number: latest.from_number,
      contact_id: contact?.contact_id || latest?.contact_id,
      contact_name: contact?.name,
      category: latest.category || 'active',
      latest_ts: latest.created_ts,
      latest_text: latest.text,
      message_id: latest.message_id,
    };
  });

  const byCategory = CATEGORIES.reduce((acc, cat) => {
    acc[cat.id] = conversations
      .filter((c) => c.category === cat.id)
      .sort((a, b) => new Date(b.latest_ts || 0) - new Date(a.latest_ts || 0));
    return acc;
  }, {});

  const selectedNumber = selectedConv?.from_number?.replace(/\s/g, '') || '';
  const threadMessages = selectedNumber
    ? messages
        .filter(
          (m) =>
            (m.from_number || '').replace(/\s/g, '') === selectedNumber ||
            (m.to_number || '').replace(/\s/g, '') === selectedNumber
        )
        .sort((a, b) => new Date(a.created_ts || 0) - new Date(b.created_ts || 0))
    : [];

  const handleSendReply = async (e) => {
    e.preventDefault();
    const text = replyText.trim();
    if (!text || !selectedConv?.from_number) return;
    setSendError('');
    setSending(true);
    try {
      await sendMessage({ to_number: selectedConv.from_number, text });
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    } catch (err) {
      setSendError(err.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

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
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Messages</h1>
        <p className="text-sm text-gray-500">WhatsApp conversations — click to open and reply</p>
      </div>

      {conversations.length === 0 ? (
        <div className="card flex flex-1 flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-600">No conversations</p>
          <p className="mt-1 text-sm text-gray-400">WhatsApp chats will appear here (one per number)</p>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 gap-4">
          <div className="flex gap-4 overflow-x-auto pb-4 shrink-0">
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
                  {(byCategory[cat.id] || []).map((conv) => (
                    <button
                      type="button"
                      key={conv.from_number}
                      onClick={() => { setSelectedConv(conv); setSendError(''); }}
                      className={`w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm hover:shadow-md transition-shadow ${
                        selectedConv?.from_number === conv.from_number ? 'ring-2 ring-brand-500 border-brand-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span className="font-medium text-gray-900 text-sm">
                          {conv.contact_name || conv.from_number}
                        </span>
                        <span>{conv.latest_ts ? new Date(conv.latest_ts).toLocaleTimeString() : ''}</span>
                      </div>
                      <p className="mt-1.5 text-sm text-gray-700 line-clamp-2">{conv.latest_text}</p>
                      {conv.contact_id ? (
                        <Link
                          to={`/leads/${conv.contact_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2 inline-block text-xs text-brand-600 hover:underline"
                        >
                          View lead
                        </Link>
                      ) : (
                        <span className="mt-2 inline-block text-xs text-gray-400">{conv.from_number}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selectedConv ? (
            <div className="flex flex-1 flex-col min-w-0 rounded-xl border border-gray-200 bg-white">
              <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedConv(null)}
                  className="lg:hidden rounded p-1.5 text-gray-500 hover:bg-gray-100"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div>
                  <p className="font-semibold text-gray-900">{selectedConv.contact_name || selectedConv.from_number}</p>
                  <p className="text-xs text-gray-500">{selectedConv.from_number}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {threadMessages.map((m) => {
                  const isThem = (m.from_number || '').replace(/\s/g, '') === selectedNumber;
                  return (
                    <div
                      key={m.message_id}
                      className={`flex ${isThem ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          isThem ? 'bg-gray-100 text-gray-900' : 'bg-brand-600 text-white'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.text}</p>
                        <p className={`mt-1 text-xs ${isThem ? 'text-gray-500' : 'text-brand-100'}`}>
                          {m.created_ts ? new Date(m.created_ts).toLocaleString() : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedConv.category === 'closed' ? (
                <div className="border-t border-gray-200 p-4">
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    <MessageSquare className="h-5 w-5 shrink-0 text-gray-400" />
                    <p>
                      This conversation is closed. Sending is disabled to comply with WhatsApp policies.
                      If the customer messages again, it will reopen as Active.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="border-t border-gray-200 p-3">
                  {sendError && <p className="mb-2 text-sm text-red-600">{sendError}</p>}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type a message..."
                      className="input-field flex-1"
                      disabled={sending}
                    />
                    <button type="submit" disabled={sending || !replyText.trim()} className="btn-primary px-4">
                      {sending ? <span className="animate-pulse">Sending…</span> : <Send className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Sent via WhatsApp using your Connect WhatsApp token.</p>
                </form>
              )}
            </div>
          ) : (
            <div className="hidden lg:flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 text-gray-500 text-sm">
              Select a conversation to view thread and reply
            </div>
          )}
        </div>
      )}
    </div>
  );
}
