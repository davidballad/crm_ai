import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useConversationMessages, useConversations } from '../hooks/useMessages';
import { useContacts } from '../hooks/useContacts';
import { sendMessage } from '../api/messages';
import { MessageSquare, Send, ArrowLeft } from 'lucide-react';

const CATEGORY_IDS = [
  { id: 'activo', label: 'Activo', color: 'border-emerald-400', dot: 'bg-emerald-500', iconColor: 'text-emerald-400' },
  { id: 'inactivo', label: 'Inactivo', color: 'border-amber-400', dot: 'bg-amber-500', iconColor: 'text-amber-400' },
  { id: 'vendido', label: 'Vendido', color: 'border-blue-400', dot: 'bg-blue-500', iconColor: 'text-blue-400' },
  { id: 'cerrado', label: 'Cerrado', color: 'border-gray-300', dot: 'bg-gray-400', iconColor: 'text-gray-400' },
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

  const categoryMap = {
    'active': 'activo',
    'incomplete': 'inactivo',
    'abandoned': 'inactivo',
    'ventas': 'vendido',
    'closed': 'cerrado',
    'active_won': 'vendido'
  };

  const normalizedConversations = conversations
    .map((c) => {
      const num = normalizePhone(c.customer_phone);
      const contact = contactByPhone[num] || null;
      const rawCat = (c.category || 'activo').toLowerCase();
      return {
        from_number: num,
        contact_id: contact?.contact_id || null,
        contact_name: contact?.name,
        category: categoryMap[rawCat] || rawCat,
        latest_ts: c.last_message_ts,
        latest_text: c.last_text || '',
      };
    })
    .filter((c) => c.from_number);

  const byCategory = CATEGORY_IDS.reduce((acc, cat) => {
    acc[cat.id] = normalizedConversations
      .filter((c) => (c.category || '').toLowerCase() === cat.id.toLowerCase())
      .sort((a, b) => new Date(b.latest_ts || 0) - new Date(a.latest_ts || 0));
    return acc;
  }, {});

  const selectedCustomerPhone = normalizePhone(selectedConv?.from_number);
  const {
    data: threadData,
    isLoading: threadLoading,
    isFetching: threadFetching,
  } = useConversationMessages(selectedCustomerPhone);
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
      queryClient.invalidateQueries({ queryKey: ['conversationMessages'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
      className={`w-full rounded-2xl border p-3.5 text-left transition-all duration-300 relative group ${
        selectedConv?.from_number === conv.from_number 
          ? 'bg-brand-500/10 border-brand-500/40 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
          : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`truncate text-sm font-bold tracking-tight ${selectedConv?.from_number === conv.from_number ? 'text-brand-400' : 'text-white/80 group-hover:text-white'}`}>
          {conv.contact_name || conv.from_number}
        </span>
        <span className="shrink-0 text-[10px] font-medium text-blue-200/30">
          {conv.latest_ts ? new Date(conv.latest_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
      <p className="line-clamp-2 text-sm text-blue-200/60 group-hover:text-blue-100 transition-colors leading-relaxed">
        {conv.latest_text || '(No message)'}
      </p>
      
      {conv.contact_id && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-400/60">LEAD</span>
          <ArrowLeft className="h-3 w-3 text-blue-200/20 rotate-180 group-hover:translate-x-1 transition-transform" />
        </div>
      )}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden landing-hero-bg rounded-3xl border border-white/10 shadow-2xl relative">
      <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />
      
      <div className="relative z-10 px-6 py-6 border-b border-white/5 bg-white/[0.02] backdrop-blur-md shrink-0">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white tracking-tight">
          <div className="p-2 rounded-xl bg-green-500/10 border border-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.1)]">
            <img src="/whatsapp-glyph.svg" alt="" className="h-6 w-6" aria-hidden />
          </div>
          {t('messages.title')}
        </h1>
        <p className="mt-1 text-sm text-blue-200/50 font-medium">{t('messages.subtitle')}</p>
      </div>

      {normalizedConversations.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center relative z-10">
          <div className="p-6 rounded-3xl bg-white/[0.03] border border-white/10 glass-card">
            <MessageSquare className="mb-4 h-12 w-12 text-blue-400/30" />
            <p className="text-xl font-semibold text-white mb-2">{t('messages.noConversations')}</p>
            <p className="text-sm text-blue-200/40 max-w-xs mx-auto">{t('messages.noConversationsHint')}</p>
          </div>
        </div>
      ) : (
        <div
          className={`flex min-h-0 flex-1 gap-6 p-6 lg:flex-row relative z-10`}
        >
          {/* Kanban / Sidebar */}
          <aside className={`hidden shrink-0 gap-6 lg:flex ${selectedConv ? 'w-80 flex-col overflow-y-auto custom-scrollbar' : 'flex-1 flex-row overflow-x-auto pb-4 custom-scrollbar'}`}>
            {CATEGORY_IDS.map((cat) => (
              <div
                key={cat.id}
                className={`flex flex-col min-h-0 glass-card overflow-hidden ${selectedConv ? 'shrink-0' : 'w-72 shrink-0'}`}
              >
                <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3 bg-white/[0.01]">
                  <span className={`h-2 w-2 rounded-full shadow-[0_0_8px_currentColor] ${cat.dot} bg-current text-${cat.dot.split('-')[1]}-400`} />
                  <h2 className="text-xs font-bold uppercase tracking-widest text-blue-100/60">{t(`messages.${cat.id}`)}</h2>
                  <span className="ml-auto rounded-full bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] font-bold text-blue-200/40">
                    {byCategory[cat.id]?.length ?? 0}
                  </span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-3 custom-scrollbar">
                  {(byCategory[cat.id] || []).map((conv) => (
                    <Fragment key={conv.from_number}>{renderConvCard(conv)}</Fragment>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          {/* Mobile / tablet: stacked category lists */}
          {!selectedConv && (
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pb-4 lg:hidden custom-scrollbar">
              {CATEGORY_IDS.map((cat) => (
                <div
                  key={cat.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md overflow-hidden glass-card"
                >
                  <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3 bg-white/[0.01]">
                    <span className={`h-2 w-2 rounded-full shadow-[0_0_8px_currentColor] ${cat.dot} bg-current text-${cat.dot.split('-')[1]}-400`} />
                    <h2 className="text-xs font-bold uppercase tracking-widest text-blue-100/60">{t(`messages.${cat.id}`)}</h2>
                    <span className="ml-auto rounded-full bg-white/5 border border-white/5 px-2 py-0.5 text-[10px] font-bold text-blue-200/40">
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
          {/* Placeholder removed in favor of full board */}

          {/* Thread — single instance (mobile + desktop) */}
          {selectedConv && (
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden glass-card">
              <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4 bg-white/[0.02]">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedConv(null)}
                    className="rounded-xl p-2 text-blue-200/50 hover:bg-white/5 hover:text-white transition-colors lg:hidden"
                    aria-label={t('messages.backToList')}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-white text-lg tracking-tight">
                      {selectedConv.contact_name || selectedConv.from_number}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)] animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/80">{selectedConv.category?.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
                {selectedConv.contact_id && (
                  <Link
                    to={`/app/leads/${selectedConv.contact_id}`}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs font-bold text-brand-400 hover:bg-brand-500/20 transition-all shadow-[0_0_20px_rgba(59,130,246,0.05)]"
                  >
                    Ver perfil
                  </Link>
                )}
              </div>
              <div
                ref={threadContainerRef}
                onScroll={handleThreadScroll}
                className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden overscroll-contain p-6 custom-scrollbar bg-white/[0.01]"
              >
                {(threadLoading || threadFetching) && threadMessages.length === 0 ? (
                  <div className="flex justify-center py-12">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-500/20 border-t-brand-500" />
                  </div>
                ) : null}
                {!threadLoading && !threadFetching && threadMessages.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-sm font-medium text-blue-200/20 italic">{t('messages.noMessagesInThread')}</p>
                  </div>
                ) : null}
                {threadMessages.map((m, idx) => {
                  const isThem = messageIsInboundForThread(m, selectedCustomerPhone);
                  return (
                    <div
                      key={m.message_id || `m-${idx}-${m.created_ts || ''}`}
                      className={`flex ${isThem ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
                    >
                      <div
                        className={`max-w-[85%] break-all break-words rounded-2xl px-4 py-3 text-sm shadow-xl ${
                          isThem 
                            ? 'bg-white/[0.05] border border-white/10 text-white leading-relaxed backdrop-blur-sm' 
                            : 'bg-brand-600 border border-brand-500/50 text-white shadow-brand-600/20'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{getMessageText(m)}</p>
                        <div className="flex items-center justify-end gap-1.5 mt-2 opacity-50">
                          <span className="text-[10px] font-medium italic">
                            {m.created_ts ? new Date(m.created_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedConv.category === 'cerrado' ? (
                <div className="shrink-0 border-t border-white/5 p-4 bg-white/[0.02]">
                  <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] border border-white/10 px-4 py-3 text-sm text-blue-200/40">
                    <MessageSquare className="h-5 w-5 shrink-0" />
                    <p>{t('messages.conversationClosed')}</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendReply} className="shrink-0 border-t border-white/5 p-6 bg-white/[0.02] backdrop-blur-xl">
                  {sendError && <p className="mb-3 text-xs font-bold text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{sendError}</p>}
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={t('messages.typeMessage')}
                      className="flex-1 bg-white/[0.05] border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-blue-200/20 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:bg-white/[0.08] transition-all"
                      disabled={sending}
                    />
                    <button 
                      type="submit" 
                      disabled={sending || !replyText.trim()} 
                      className="bg-brand-600 hover:bg-brand-500 text-white rounded-2xl px-5 py-3 shadow-lg shadow-brand-600/20 hover:shadow-brand-600/40 transition-all disabled:opacity-50 disabled:grayscale"
                    >
                      {sending ? <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="h-5 w-5" />}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-blue-200/20 text-center">{t('messages.sentViaHint')}</p>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
