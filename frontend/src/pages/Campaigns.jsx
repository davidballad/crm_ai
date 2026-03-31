import { useState } from 'react';
import {
  Megaphone, Plus, Send, Trash2, ChevronDown, ChevronUp, Users, Clock, CheckCircle, AlertCircle, Loader2,
} from 'lucide-react';
import { useCampaigns, useCreateCampaign, useSendCampaign, useDeleteCampaign } from '../hooks/useCampaigns';

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

const CAMPAIGN_STATUS_CONFIG = {
  draft: { label: 'Borrador', color: 'bg-gray-100 text-gray-700', icon: Clock },
  sending: { label: 'Enviando…', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  sent: { label: 'Enviada', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  failed: { label: 'Falló', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

const VARIABLES_HINT = ['{{name}}', '{{business}}'];

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

function CreateCampaignModal({ onClose }) {
  const createCampaign = useCreateCampaign();
  const [form, setForm] = useState({
    name: '',
    message_template: '',
    tier: '',
    lead_status: '',
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('El nombre es requerido'); return; }
    if (!form.message_template.trim()) { setError('El mensaje es requerido'); return; }

    const segment_filters = {};
    if (form.tier) segment_filters.tier = form.tier;
    if (form.lead_status) segment_filters.lead_status = form.lead_status;

    try {
      await createCampaign.mutateAsync({
        name: form.name.trim(),
        message_template: form.message_template.trim(),
        segment_filters,
      });
      onClose();
    } catch (err) {
      setError('Error al crear la campaña. Intenta de nuevo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Nueva campaña</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre de la campaña</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Promo fin de semana"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Mensaje
              <span className="ml-2 font-normal text-gray-400 text-xs">
                Variables: {VARIABLES_HINT.join(', ')}
              </span>
            </label>
            <textarea
              value={form.message_template}
              onChange={(e) => setForm((f) => ({ ...f, message_template: e.target.value }))}
              rows={4}
              placeholder="Hola {{name}}, tenemos una promoción especial para ti..."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Segmento de clientes</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nivel</label>
                <select
                  value={form.tier}
                  onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {TIER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Estado</label>
                <select
                  value={form.lead_status}
                  onChange={(e) => setForm((f) => ({ ...f, lead_status: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              Sin filtros = se envía a todos los clientes con número de WhatsApp.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createCampaign.isPending}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
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
  const sendCampaign = useSendCampaign();
  const deleteCampaign = useDeleteCampaign();

  const canSend = campaign.status === 'draft' || campaign.status === 'failed';
  const canDelete = campaign.status !== 'sending';

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
            {campaign.failed_count > 0 && (
              <div className="text-red-500">{campaign.failed_count} fallidos</div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          {canSend && (
            <button
              onClick={() => sendCampaign.mutate(campaign.id || campaign.campaign_id)}
              disabled={sendCampaign.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => {
                if (confirm('¿Eliminar esta campaña?')) {
                  deleteCampaign.mutate(campaign.id || campaign.campaign_id);
                }
              }}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
          <p className="text-xs font-medium text-gray-500 mb-1">Mensaje</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{campaign.message_template}</p>
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

export default function Campaigns() {
  const [showCreate, setShowCreate] = useState(false);
  const { data, isLoading, error } = useCampaigns();
  const campaigns = data?.campaigns || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campañas</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Envía mensajes de WhatsApp a segmentos de clientes
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Nueva campaña
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
          Error al cargar las campañas.
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-16 text-center">
          <Megaphone className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Aún no tienes campañas</p>
          <p className="text-sm text-gray-400 mt-1">
            Crea tu primera campaña para enviar mensajes masivos por WhatsApp.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Crear campaña
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <CampaignRow key={c.id || c.campaign_id} campaign={c} />
          ))}
        </div>
      )}

      {showCreate && <CreateCampaignModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
