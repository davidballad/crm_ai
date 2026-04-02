import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Megaphone, Plus, Minus, Send, Trash2, ChevronDown, ChevronUp, Users, Clock,
  CheckCircle, AlertCircle, Loader2, Sparkles, Lock, Download, Link,
  UserMinus, Star, ShoppingBag,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCampaigns, useCreateCampaign, useSendCampaign, useDeleteCampaign } from '../hooks/useCampaigns';
import { useProducts } from '../hooks/useProducts';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { useTenantConfig } from '../hooks/useTenantConfig';
import { patchTenantConfig } from '../api/onboarding';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const CAMPAIGN_STATUS_CONFIG = {
  draft:   { label: 'Borrador',   color: 'bg-gray-100 text-gray-700',  icon: Clock },
  sending: { label: 'Enviando…',  color: 'bg-blue-100 text-blue-700',  icon: Loader2 },
  sent:    { label: 'Enviada',    color: 'bg-green-100 text-green-700', icon: CheckCircle },
  failed:  { label: 'Falló',      color: 'bg-red-100 text-red-700',    icon: AlertCircle },
};

function StatusBadge({ status }) {
  const cfg = CAMPAIGN_STATUS_CONFIG[status] || CAMPAIGN_STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className={`h-3.5 w-3.5 ${status === 'sending' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

const TIER_OPTIONS = [
  { value: '', label: 'Todos los niveles' },
  { value: 'bronze', label: 'Bronce' },
  { value: 'silver', label: 'Plata' },
  { value: 'gold', label: 'Oro' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'prospect', label: 'Prospecto' },
  { value: 'interested', label: 'Interesado' },
  { value: 'closed_won', label: 'Compró' },
  { value: 'abandoned', label: 'Abandonado' },
];

function CreateCampaignModal({ onClose }) {
  const createCampaign = useCreateCampaign();
  const [form, setForm] = useState({ name: '', message_template: '', tier: '', lead_status: '' });
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) { setFormError('El nombre es requerido'); return; }
    if (!form.message_template.trim()) { setFormError('El mensaje es requerido'); return; }
    const segment_filters = {};
    if (form.tier) segment_filters.tier = form.tier;
    if (form.lead_status) segment_filters.lead_status = form.lead_status;
    try {
      await createCampaign.mutateAsync({ name: form.name.trim(), message_template: form.message_template.trim(), segment_filters });
      onClose();
    } catch {
      setFormError('Error al crear la campaña. Intenta de nuevo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Nueva campaña WhatsApp</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {formError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre de la campaña</label>
            <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Promo fin de semana"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Mensaje
              <span className="ml-2 font-normal text-gray-400 text-xs">Variables: {'{{name}}'}, {'{{business}}'}</span>
            </label>
            <textarea value={form.message_template} onChange={(e) => setForm(f => ({ ...f, message_template: e.target.value }))}
              rows={4} placeholder="Hola {{name}}, tenemos una promoción especial para ti..."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Segmento de clientes</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nivel</label>
                <select value={form.tier} onChange={(e) => setForm(f => ({ ...f, tier: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  {TIER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Estado</label>
                <select value={form.lead_status} onChange={(e) => setForm(f => ({ ...f, lead_status: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500">
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">Sin filtros = se envía a todos los clientes con WhatsApp.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={createCampaign.isPending}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {createCampaign.isPending ? 'Guardando…' : 'Guardar borrador'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CampaignRow({ campaign }) {
  const [expanded, setExpanded] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const sendCampaign = useSendCampaign();
  const deleteCampaign = useDeleteCampaign();
  const queryClient = useQueryClient();

  const canSend = campaign.status === 'draft' || campaign.status === 'failed';
  const canDelete = campaign.status !== 'sending';

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.patch(`/campaigns/${campaign.id || campaign.campaign_id}`, { status: 'failed', error_message: 'Cancelado manualmente' });
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    } finally {
      setCancelling(false);
    }
  };

  const filters = campaign.segment_filters || {};
  const filterSummary = [
    filters.tier ? `Nivel: ${filters.tier}` : null,
    filters.lead_status ? `Estado: ${filters.lead_status}` : null,
    filters.tag ? `Etiqueta: ${filters.tag}` : null,
  ].filter(Boolean).join(' · ') || 'Todos los clientes';

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 truncate">{campaign.name}</span>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="mt-0.5 text-xs text-gray-400">{filterSummary}</p>
        </div>
        {campaign.status === 'sent' && (
          <div className="text-right text-xs text-gray-500 shrink-0">
            <div className="text-green-600 font-semibold">{campaign.sent_count} enviados</div>
            {campaign.failed_count > 0 && <div className="text-red-500">{campaign.failed_count} fallidos</div>}
          </div>
        )}
        <div className="flex items-center gap-2 shrink-0">
          {campaign.status === 'sending' && (
            <button onClick={handleCancel} disabled={cancelling}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors">
              {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertCircle className="h-3.5 w-3.5" />} Cancelar
            </button>
          )}
          {canSend && (
            <button onClick={() => sendCampaign.mutate(campaign.id || campaign.campaign_id)} disabled={sendCampaign.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              <Send className="h-3.5 w-3.5" /> Enviar
            </button>
          )}
          {canDelete && (
            <button onClick={() => { if (confirm('¿Eliminar esta campaña?')) deleteCampaign.mutate(campaign.id || campaign.campaign_id); }}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => setExpanded(v => !v)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Mensaje</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{campaign.message_template}</p>
          {campaign.status === 'failed' && campaign.error_message && (
            <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-xs font-medium text-red-600">Motivo del fallo</p>
              <p className="text-xs text-red-700 mt-0.5">{campaign.error_message}</p>
            </div>
          )}
          {campaign.created_at && (
            <p className="mt-2 text-xs text-gray-400">
              Creada: {new Date(campaign.created_at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function WhatsAppTab({ onNewCampaign }) {
  const { data, isLoading, error } = useCampaigns();
  const campaigns = data?.campaigns || [];

  if (isLoading) return (
    <div className="flex h-40 items-center justify-center">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
    </div>
  );

  if (error) return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
      Error al cargar las campañas.
    </div>
  );

  if (campaigns.length === 0) return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
      <Megaphone className="h-12 w-12 text-gray-300 mb-3" />
      <p className="text-gray-500 font-medium">Aún no tienes campañas</p>
      <p className="text-sm text-gray-400 mt-1">Crea tu primera campaña para enviar mensajes masivos por WhatsApp.</p>
      <button onClick={onNewCampaign}
        className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors">
        <Plus className="h-4 w-4" /> Crear campaña
      </button>
    </div>
  );

  return (
    <div className="space-y-3">
      {campaigns.map(c => <CampaignRow key={c.id || c.campaign_id} campaign={c} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Social Media Campaigns tab (Anuncios)
// ---------------------------------------------------------------------------

const SCENARIOS = [
  {
    id: 'inactive',
    label: 'Clientes inactivos',
    description: 'Reactiva clientes que no han comprado en más de 30 días',
    icon: UserMinus,
    color: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  {
    id: 'featured',
    label: 'Producto destacado',
    description: 'Promociona tu producto más vendido con imagen y copy',
    icon: ShoppingBag,
    color: 'bg-purple-50 text-purple-600 border-purple-100',
  },
  {
    id: 'vip',
    label: 'Clientes VIP',
    description: 'Oferta exclusiva para tus mejores compradores',
    icon: Star,
    color: 'bg-amber-50 text-amber-600 border-amber-100',
  },
];

function CampaignKit({ result }) {
  const { copy, image_url, wa_link } = result;

  const handleDownload = async () => {
    if (!image_url) return;
    const res = await fetch(image_url);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'campaign-image.png';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyLink = () => {
    if (wa_link) navigator.clipboard.writeText(wa_link);
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Image */}
      {image_url && (
        <div className="relative rounded-xl overflow-hidden border border-gray-200">
          <img src={image_url} alt="Marketing image" className="w-full object-cover max-h-72" />
          <button onClick={handleDownload}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-800 shadow hover:bg-white transition-colors">
            <Download className="h-3.5 w-3.5" /> Descargar
          </button>
        </div>
      )}
      {/* Copy */}
      {copy && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          {copy.headline && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Título</p>
              <p className="mt-0.5 text-sm font-bold text-gray-900">{copy.headline}</p>
            </div>
          )}
          {copy.body && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Texto del anuncio</p>
              <p className="mt-0.5 text-sm text-gray-700 whitespace-pre-wrap">{copy.body}</p>
            </div>
          )}
          {copy.cta && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Botón CTA</p>
              <p className="mt-0.5 text-sm font-medium text-indigo-600">{copy.cta}</p>
            </div>
          )}
        </div>
      )}

      {/* WhatsApp link */}
      {wa_link && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-semibold text-green-700 mb-1">Enlace para el anuncio</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate text-xs text-green-800 bg-green-100 rounded px-2 py-1">{wa_link}</code>
            <button onClick={handleCopyLink}
              className="flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors">
              <Link className="h-3 w-3" /> Copiar
            </button>
          </div>
          <p className="mt-1.5 text-xs text-green-600">Pega este enlace en tu anuncio de Meta/Instagram. Cuando alguien lo toque, se abrirá WhatsApp directo con tu negocio.</p>
        </div>
      )}
    </div>
  );
}

function ScenarioCard({ scenario, onGenerated }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [agentError, setAgentError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const Icon = scenario.icon;

  const { data: productsData } = useProducts({});
  const products = scenario.id === 'featured' ? (productsData?.products || []) : [];

  const handleRun = async () => {
    setLoading(true);
    setAgentError('');
    setResult(null);
    try {
      const body = selectedProductId ? { product_id: selectedProductId } : {};
      const res = await api.post(`/agents/${scenario.id}/run`, body);
      setResult(res);
      setExpanded(true);
      onGenerated?.();
    } catch (err) {
      if (err.message?.toLowerCase().includes('pro')) {
        setAgentError('pro_required');
      } else {
        setAgentError(err.message || 'Error al generar la campaña');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 rounded-xl border p-3 ${scenario.color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">{scenario.label}</h3>
            <p className="text-sm text-gray-500 mt-0.5">{scenario.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {result && (
              <button onClick={() => setExpanded(v => !v)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            )}
            <button onClick={handleRun} disabled={loading}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors">
              {loading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generando…</>
                : <><Sparkles className="h-3.5 w-3.5" /> {result ? 'Regenerar' : 'Generar'}</>}
            </button>
          </div>
        </div>

        {scenario.id === 'featured' && (
          <div className="mt-3 flex items-center gap-2">
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Producto más vendido (automático)</option>
              {products.map(p => {
                const pid = p.sk?.split('#').pop() || p.id || '';
                return <option key={pid} value={pid}>{p.name}</option>;
              })}
            </select>
            <a href="/app/inventory/new" target="_blank" rel="noopener noreferrer"
              className="shrink-0 text-xs text-indigo-600 hover:text-indigo-700 underline whitespace-nowrap">
              + Agregar producto
            </a>
          </div>
        )}

        {agentError === 'pro_required' && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <Lock className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-sm text-amber-700">
              Los anuncios IA son exclusivos del <strong>plan Pro</strong>. Actualiza tu cuenta para usarlos.
            </p>
          </div>
        )}

        {agentError && agentError !== 'pro_required' && (
          <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{agentError}</div>
        )}

        {result && expanded && <CampaignKit result={result} />}
      </div>
    </div>
  );
}

const SCENARIO_LABELS = { inactive: 'Clientes inactivos', featured: 'Producto destacado', vip: 'Clientes VIP' };

function AiCampaignHistory({ refreshKey }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ai-campaign-history', refreshKey],
    queryFn: () => api.get('/agents/history'),
  });
  const campaigns = data?.campaigns || [];

  if (isLoading) return (
    <div className="flex h-16 items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
    </div>
  );

  if (isError) return (
    <p className="text-center text-sm text-red-400 py-6">Error al cargar el historial.</p>
  );

  if (campaigns.length === 0) return (
    <p className="text-center text-sm text-gray-400 py-6">Aún no has generado ningún anuncio.</p>
  );

  return (
    <div className="space-y-3">
      {campaigns.map(c => (
        <HistoryCard key={c.id} campaign={c} />
      ))}
    </div>
  );
}

function HistoryCard({ campaign }) {
  const [expanded, setExpanded] = useState(false);
  const { copy, image_url, wa_link, scenario, created_at } = campaign;

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        {image_url && (
          <img src={image_url} alt="" className="h-12 w-12 rounded-lg object-cover shrink-0 border border-gray-200" />
        )}
        {!image_url && (
          <div className="h-12 w-12 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-gray-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{copy?.headline || '—'}</p>
          <p className="text-xs text-gray-400">
            {SCENARIO_LABELS[scenario] || scenario}
            {created_at && ` · ${new Date(created_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })}`}
          </p>
        </div>
        <button onClick={() => setExpanded(v => !v)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {expanded && (
        <div className="border-t border-gray-100">
          <div className="px-4 py-3">
            <CampaignKit result={{ copy, image_url, wa_link }} />
          </div>
        </div>
      )}
    </div>
  );
}

function AdsTab() {
  const [historyKey, setHistoryKey] = useState(0);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-5 py-4 flex items-start gap-3">
        <Sparkles className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-indigo-900">Campañas para Redes Sociales</p>
          <p className="text-sm text-indigo-700 mt-0.5">
            La IA analiza tus datos y genera el copy profesional diseñado para convertir. Incluye tu enlace directo de WhatsApp para maximizar las ventas por mensajes.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {SCENARIOS.map(s => (
          <ScenarioCard key={s.id} scenario={s} onGenerated={() => setHistoryKey(k => k + 1)} />
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Historial de anuncios generados</h2>
        <AiCampaignHistory refreshKey={historyKey} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Follow-up tab (Seguimiento)
// ---------------------------------------------------------------------------


function FollowUpTab() {
  const { t } = useTranslation();
  const { data: config } = useTenantConfig();
  const [sequences, setSequences] = useState([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const DEFAULT_SEQUENCES = [
    { delay_hours: 2, message: '', mark_abandoned_after: false },
    { delay_hours: 22, message: '', mark_abandoned_after: true }
  ];

  useEffect(() => {
    if (config?.follow_up_sequences && config.follow_up_sequences.length > 0) {
      setSequences(config.follow_up_sequences);
    } else if (config && (!config.follow_up_sequences || config.follow_up_sequences.length === 0)) {
      setSequences(DEFAULT_SEQUENCES);
    }
  }, [config]);

  const handleAddStep = () => {
    setSequences([...sequences, { delay_hours: 2, message: '', mark_abandoned_after: false }]);
  };

  const handleRemoveStep = (index) => {
    setSequences(sequences.filter((_, i) => i !== index));
  };

  const handleChange = (index, field, value) => {
    setSequences(sequences.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess('');
    try {
      await patchTenantConfig({ follow_up_sequences: sequences });
      setSuccess(t('whatsapp.sequencesSaved') || 'Secuencias guardadas correctamente.');
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-5 py-4 flex items-start gap-3">
        <Clock className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-900">{t('whatsapp.followupTitle')}</p>
          <p className="text-sm text-blue-700 mt-0.5">{t('whatsapp.followupDesc')}</p>
        </div>
      </div>

      {success && <div className="rounded-lg bg-green-100 px-4 py-3 text-sm text-green-700 flex items-center gap-2"><CheckCircle className="h-4 w-4" /> {success}</div>}

      <div className="space-y-3">
        {sequences.map((seq, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">{t('whatsapp.step')} {i + 1}</span>
              <button onClick={() => handleRemoveStep(i)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>


            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('whatsapp.waitHours')}</label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleChange(i, 'delay_hours', Math.max(1, (seq.delay_hours || 0) - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      value={seq.delay_hours}
                      onChange={(e) => handleChange(i, 'delay_hours', Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="sr-only">horas</span>
                  </div>
                  <button
                    onClick={() => handleChange(i, 'delay_hours', (seq.delay_hours || 0) + 1)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!seq.mark_abandoned_after}
                    onChange={(e) => handleChange(i, 'mark_abandoned_after', e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  {t('whatsapp.markAbandoned')}
                </label>
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-xs font-medium text-gray-700">{t('whatsapp.messageLabel')}</label>
              <textarea
                value={seq.message || ''}
                onChange={(e) => handleChange(i, 'message', e.target.value)}
                rows={3}
                placeholder={t('whatsapp.placeholderFollowup')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        ))}
      </div>

      {sequences.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
          <Clock className="h-10 w-10 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm font-medium">No hay pasos configurados</p>
          <p className="text-xs text-gray-400">Agrega un paso para empezar a recuperar carritos.</p>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button onClick={handleAddStep} className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
          <Plus className="h-4 w-4" /> {t('whatsapp.addStep')}
        </button>
        <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors shadow-sm">
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('whatsapp.saving')}</> : t('whatsapp.saveSequences')}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Campaigns() {
  const [activeTab, setActiveTab] = useState('whatsapp');
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campañas</h1>
          <p className="mt-0.5 text-sm text-gray-500">WhatsApp masivo y anuncios de redes sociales</p>
        </div>
        {activeTab === 'whatsapp' && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm">
            <Plus className="h-4 w-4" /> Nueva campaña
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        <button onClick={() => setActiveTab('whatsapp')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'whatsapp' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Megaphone className="h-4 w-4" /> WhatsApp
        </button>
        <button onClick={() => setActiveTab('ads')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'ads' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Sparkles className="h-4 w-4" /> Anuncios IA
        </button>
        <button onClick={() => setActiveTab('followup')}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'followup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Clock className="h-4 w-4" /> Seguimiento
        </button>
      </div>

      {/* Content */}
      {activeTab === 'ads' && <AdsTab />}
      {activeTab === 'whatsapp' && <WhatsAppTab onNewCampaign={() => setShowCreate(true)} />}
      {activeTab === 'followup' && <FollowUpTab />}

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
