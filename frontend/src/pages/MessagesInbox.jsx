import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversationMessages, useConversations } from '../hooks/useMessages';
import { useContacts } from '../hooks/useContacts';
import { sendMessage } from '../api/messages';
import { MessageSquare, Send, ArrowLeft } from 'lucide-react';

const CATEGORY_IDS = [
  { id: 'active', color: 'border-green-400', dot: 'bg-green-500' },
  { id: 'incomplete', color: 'border-yellow-400', dot: 'bg-yellow-500' },
  { id: 'ventas', color: 'border-blue-400', dot: 'bg-blue-500' },
  { id: 'closed', color: 'border-gray-300', dot: 'bg-gray-400' },
];

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

/** True = customer / left bubble; false = business / right. Uses API direction + phone fallback (no business number variable). */
function messageIsInboundForThread(m, customerDigits) {
  const dir = (m.direction || '').toLowerCase();
  if (dir === 'inbound') return true;
  if (dir === 'outbound') return false;
  const from = normalizePhone(m.from_number);
  const to = normalizePhone(m.to_number);
  if (from === customerDigits) return true;
  if (to === customerDigits) return false;
  return true;
}

export default function MessagesInbox() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useConversations();
  const { data: contactsData } = useContacts();
  const [selectedConv, setSelectedConv] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const threadContainerRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const previousConversationRef = useRef('');

  const conversations = data?.conversations || [];
  const contacts = contactsData?.contacts || [];
  const contactsMap = contacts.reduce((acc, c) => {
    acc[c.contact_id] = c;
    return acc;
  }, {});
  const contactByPhone = contacts.reduce((acc, c) => {
    const normalized = normalizePhone(c.phone);
    if (normalized) acc[normalized] = c;
    return acc;
  }, {});

  const normalizedConversations = conversations
    .map((c) => {
      const num = normalizePhone(c.customer_phone);
      const contact = contactByPhone[num] || null;
      return {
        from_number: num,
        contact_id: contact?.contact_id || null,
        contact_name: contact?.name,
        category: c.category || 'active',
        latest_ts: c.last_message_ts,
        latest_text: c.last_text || '',
      };
    })
    .filter((c) => c.from_number);

  const byCategory = CATEGORY_IDS.reduce((acc, cat) => {
    acc[cat.id] = normalizedConversations
      .filter((c) => c.category === cat.id)
      .sort((a, b) => new Date(b.latest_ts || 0) - new Date(a.latest_ts || 0));
    return acc;
  }, {});

  const selectedCustomerPhone = normalizePhone(selectedConv?.from_number);
  const { data: threadData } = useConversationMessages(selectedCustomerPhone);
  const threadMessages = (threadData?.messages || []).sort(
    (a, b) => new Date(a.created_ts || 0) - new Date(b.created_ts || 0),
  );

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
    if (t === null || t === undefined) return '';
    return typeof t === 'string' ? t : String(t);
  };

  const scrollThreadToBottom = () => {
    const el = threadContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  // After DOM paints: pin to latest messages (opening chat or new messages while at bottom)
  useLayoutEffect(() => {
    if (!selectedCustomerPhone) return;
    const isConversationChange = previousConversationRef.current !== selectedCustomerPhone;
    if (isConversationChange) {
      stickToBottomRef.current = true;
    }
    if (!isConversationChange && !stickToBottomRef.current) return;

    scrollThreadToBottom();
    requestAnimationFrame(() => {
      scrollThreadToBottom();
      requestAnimationFrame(scrollThreadToBottom);
    });
    previousConversationRef.current = selectedCustomerPhone;
  }, [selectedCustomerPhone, threadMessages.length]);

  // Late layout (fonts/images): nudge bottom only if we should stay pinned
  useEffect(() => {
    if (!selectedCustomerPhone) return;
    const nudge = () => {
      if (!stickToBottomRef.current) return;
      scrollThreadToBottom();
    };
    const t = window.setTimeout(nudge, 80);
    const t2 = window.setTimeout(nudge, 250);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [selectedCustomerPhone, threadMessages.length]);

  const handleThreadScroll = () => {
    const container = threadContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= 80;
  };

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
      setSendError(err.message || t('messages.failedToSend'));
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

  const renderConvCard = (conv) => (
    <button
      type="button"
      onClick={() => {
        setSelectedConv(conv);
        setSendError('');
      }}
      className={`w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md ${
        selectedConv?.from_number === conv.from_number ? 'ring-2 ring-brand-500 border-brand-500' : ''
      }`}
    >
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="truncate text-sm font-medium text-gray-900">{conv.contact_name || conv.from_number}</span>
        <span className="ml-2 shrink-0">{conv.latest_ts ? new Date(conv.latest_ts).toLocaleTimeString() : ''}</span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-sm text-gray-700">{conv.latest_text}</p>
      {conv.contact_id ? (
        <Link
          to={`/app/leads/${conv.contact_id}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 inline-block text-xs text-brand-600 hover:underline"
        >
          {t('messages.viewLead')}
        </Link>
      ) : (
        <span className="mt-2 inline-block text-xs text-gray-400">{conv.from_number}</span>
      )}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 shrink-0">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <img src="/whatsapp-glyph.svg" alt="" className="h-6 w-6" aria-hidden />
          {t('messages.title')}
        </h1>
        <p className="text-sm text-gray-500">{t('messages.subtitle')}</p>
      </div>

      {normalizedConversations.length === 0 ? (
        <div className="card flex flex-1 flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-600">{t('messages.noConversations')}</p>
          <p className="mt-1 text-sm text-gray-400">{t('messages.noConversationsHint')}</p>
        </div>
      ) : (
        <div
          className={`flex min-h-0 flex-1 flex-col gap-4 lg:flex-row ${
            selectedConv
              ? 'h-[min(560px,calc(100dvh-12rem))] max-h-[calc(100dvh-12rem)] lg:h-[min(680px,calc(100vh-11rem))] lg:max-h-[min(720px,calc(100vh-11rem))]'
              : 'lg:max-h-[min(720px,calc(100vh-11rem))]'
          }`}
        >
          {/* Kanban — desktop only */}
          <aside className="hidden w-96 shrink-0 flex-col gap-4 overflow-y-auto lg:flex">
            {CATEGORY_IDS.map((cat) => (
              <div
                key={cat.id}
                className={`flex flex-col rounded-xl border border-gray-200 border-t-4 ${cat.color} bg-gray-50/50`}
              >
                <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${cat.dot}`} />
                  <h2 className="font-semibold text-gray-900">{t(`messages.${cat.id}`)}</h2>
                  <span className="ml-auto rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {byCategory[cat.id]?.length ?? 0}
                  </span>
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                  {(byCategory[cat.id] || []).map((conv) => (
                    <Fragment key={conv.from_number}>{renderConvCard(conv)}</Fragment>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          {/* Mobile / tablet: stacked category lists */}
          {!selectedConv && (
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2 lg:hidden">
              {CATEGORY_IDS.map((cat) => (
                <div
                  key={cat.id}
                  className={`rounded-xl border border-gray-200 border-t-4 ${cat.color} bg-gray-50/50`}
                >
                  <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${cat.dot}`} />
                    <h2 className="text-sm font-semibold text-gray-900">{t(`messages.${cat.id}`)}</h2>
                    <span className="ml-auto rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {byCategory[cat.id]?.length ?? 0}
                    </span>
                  </div>
                  <div className="space-y-2 p-3">
                    {(byCategory[cat.id] || []).map((conv) => (
                      <Fragment key={conv.from_number}>{renderConvCard(conv)}</Fragment>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Desktop: placeholder when no chat selected */}
          {!selectedConv && (
            <div className="hidden flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 text-sm text-gray-500 lg:flex">
              {t('messages.selectConversation')}
            </div>
          )}

          {/* Thread — single instance (mobile + desktop) */}
          {selectedConv && (
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedConv(null)}
                  className="rounded p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden"
                  aria-label={t('messages.backToList')}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-900">{selectedConv.contact_name || selectedConv.from_number}</p>
                  <p className="truncate text-xs text-gray-500">{selectedConv.from_number}</p>
                </div>
              </div>
              <div
                ref={threadContainerRef}
                onScroll={handleThreadScroll}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain p-4 [scrollbar-gutter:stable]"
              >
                {threadMessages.map((m) => {
                  const isThem = messageIsInboundForThread(m, selectedCustomerPhone);
                  return (
                    <div key={m.message_id} className={`flex ${isThem ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          isThem ? 'bg-gray-100 text-gray-900' : 'bg-brand-600 text-white'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{getMessageText(m)}</p>
                        <p className={`mt-1 text-xs ${isThem ? 'text-gray-500' : 'text-brand-100'}`}>
                          {m.created_ts ? new Date(m.created_ts).toLocaleString() : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedConv.category === 'closed' ? (
                <div className="shrink-0 border-t border-gray-200 p-4">
                  <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
                    <MessageSquare className="h-5 w-5 shrink-0 text-gray-400" />
                    <p>{t('messages.conversationClosed')}</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="shrink-0 border-t border-gray-200 p-3">
                  {sendError && <p className="mb-2 text-sm text-red-600">{sendError}</p>}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={t('messages.typeMessage')}
                      className="input-field min-w-0 flex-1"
                      disabled={sending}
                    />
                    <button type="submit" disabled={sending || !replyText.trim()} className="btn-primary shrink-0 px-4">
                      {sending ? <span className="animate-pulse">{t('messages.sending')}</span> : <Send className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">{t('messages.sentViaHint')}</p>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
