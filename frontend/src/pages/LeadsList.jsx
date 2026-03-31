import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContacts, usePatchContact, useBulkTagContacts } from '../hooks/useContacts';
import { downloadLeadsExport } from '../api/contacts';
import { usePlan } from '../hooks/useTenantConfig';
import UpgradeWall from '../components/UpgradeWall';
import {
  Users, Download, SlidersHorizontal, X, ChevronDown, ChevronUp,
  Tag, CheckSquare, Square, Megaphone,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STATUSES = [
  { id: 'prospect', label: 'Prospecto', color: 'border-gray-400', dot: 'bg-gray-500' },
  { id: 'interested', label: 'Interesado', color: 'border-blue-400', dot: 'bg-blue-500' },
  { id: 'closed_won', label: 'Cerrado ganado', color: 'border-green-400', dot: 'bg-green-500' },
  { id: 'abandoned', label: 'Abandonado', color: 'border-red-400', dot: 'bg-red-500' },
];

const TIER_OPTIONS = [
  { value: '', label: 'Todos los niveles' },
  { value: 'bronze', label: 'Bronce' },
  { value: 'silver', label: 'Plata' },
  { value: 'gold', label: 'Oro' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...STATUSES.map((s) => ({ value: s.id, label: s.label })),
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

function FilterPanel({ filters, setFilters, onClose }) {
  const [local, setLocal] = useState(filters);

  const apply = () => {
    setFilters(local);
    onClose();
  };

  const reset = () => {
    const empty = { tier: '', lead_status: '', tag: '', min_spent: '', max_spent: '', days_inactive: '' };
    setLocal(empty);
    setFilters(empty);
    onClose();
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Filtros de segmento</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nivel</label>
          <select
            value={local.tier}
            onChange={(e) => setLocal((f) => ({ ...f, tier: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {TIER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Estado</label>
          <select
            value={local.lead_status}
            onChange={(e) => setLocal((f) => ({ ...f, lead_status: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Etiqueta</label>
          <input
            type="text"
            value={local.tag}
            onChange={(e) => setLocal((f) => ({ ...f, tag: e.target.value }))}
            placeholder="vip, promo…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Gasto mín. ($)</label>
          <input
            type="number"
            value={local.min_spent}
            onChange={(e) => setLocal((f) => ({ ...f, min_spent: e.target.value }))}
            placeholder="0"
            min="0"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Gasto máx. ($)</label>
          <input
            type="number"
            value={local.max_spent}
            onChange={(e) => setLocal((f) => ({ ...f, max_spent: e.target.value }))}
            placeholder="Sin límite"
            min="0"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Días sin comprar</label>
          <input
            type="number"
            value={local.days_inactive}
            onChange={(e) => setLocal((f) => ({ ...f, days_inactive: e.target.value }))}
            placeholder="Ej: 30"
            min="1"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-1">
        <button
          onClick={reset}
          className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Limpiar filtros
        </button>
        <button
          onClick={apply}
          className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}

function TagModal({ onConfirm, onClose }) {
  const [tag, setTag] = useState('');
  const [action, setAction] = useState('add');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Gestionar etiqueta</h2>
        </div>
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Etiqueta</label>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="vip, promo, inactivo…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            {['add', 'remove'].map((a) => (
              <button
                key={a}
                onClick={() => setAction(a)}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                  action === a ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {a === 'add' ? 'Agregar' : 'Quitar'}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => tag.trim() && onConfirm(tag.trim(), action)}
              disabled={!tag.trim()}
              className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const EMPTY_FILTERS = { tier: '', lead_status: '', tag: '', min_spent: '', max_spent: '', days_inactive: '' };

function hasActiveFilters(f) {
  return Object.values(f).some(Boolean);
}

export default function LeadsList() {
  const { isPro, isLoading: planLoading } = usePlan();
  const navigate = useNavigate();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showTagModal, setShowTagModal] = useState(false);

  const queryOpts = useMemo(() => {
    const opts = {};
    if (filters.tier) opts.tier = filters.tier;
    if (filters.lead_status) opts.lead_status = filters.lead_status;
    if (filters.tag) opts.tag = filters.tag;
    if (filters.min_spent !== '') opts.min_spent = Number(filters.min_spent);
    if (filters.max_spent !== '') opts.max_spent = Number(filters.max_spent);
    if (filters.days_inactive !== '') opts.days_inactive = Number(filters.days_inactive);
    return opts;
  }, [filters]);

  const { data, isLoading, error } = useContacts(queryOpts);
  const patchContact = usePatchContact();
  const bulkTag = useBulkTagContacts();

  if (planLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (!isPro) return <UpgradeWall featureKey="leads" />;

  const contacts = data?.contacts || [];

  const allIds = contacts.map((c) => c.contact_id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleDownloadLeads = async () => {
    try {
      await downloadLeadsExport();
    } catch (err) {
      window.alert(err.message || 'No se pudo descargar el archivo de leads');
    }
  };

  const handleStatusChange = (contactId, e) => {
    const lead_status = e.target.value;
    if (!contactId || !lead_status) return;
    e.preventDefault();
    e.stopPropagation();
    patchContact.mutate({ id: contactId, data: { lead_status } });
  };

  const handleBulkTag = async (tag, action) => {
    await bulkTag.mutateAsync({ contact_ids: Array.from(selected), tags: [tag], action });
    setShowTagModal(false);
    setSelected(new Set());
  };

  const handleSendCampaign = () => {
    navigate('/app/campaigns');
  };

  const byStatus = STATUSES.reduce((acc, s) => {
    acc[s.id] = contacts.filter((c) => (c.lead_status || 'prospect') === s.id);
    return acc;
  }, {});

  const activeFilters = hasActiveFilters(filters);

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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Prospectos</h1>
          <p className="text-sm text-gray-500">
            {contacts.length} {activeFilters ? 'coinciden con los filtros' : 'total'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              activeFilters
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeFilters && (
              <span className="ml-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {Object.values(filters).filter(Boolean).length}
              </span>
            )}
            {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleDownloadLeads}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <FilterPanel
          filters={filters}
          setFilters={setFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <span className="text-sm font-medium text-indigo-800">
            {selected.size} seleccionado{selected.size !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setShowTagModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Tag className="h-3.5 w-3.5" />
              Etiqueta
            </button>
            <button
              onClick={handleSendCampaign}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <Megaphone className="h-3.5 w-3.5" />
              Campaña
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-100 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <Users className="mb-3 h-10 w-10 text-gray-300" />
          <p className="font-medium text-gray-600">
            {activeFilters ? 'Sin resultados para estos filtros' : 'Aun no hay prospectos'}
          </p>
          <p className="mt-1 text-sm text-gray-400">
            {activeFilters
              ? 'Prueba con otros criterios de segmento.'
              : 'Los prospectos se crean automaticamente desde el flujo de WhatsApp'}
          </p>
          {activeFilters && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="mt-3 text-sm font-medium text-indigo-600 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Select all row */}
          <div className="flex items-center gap-2 px-1">
            <button
              onClick={toggleAll}
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              {allSelected
                ? <CheckSquare className="h-4 w-4 text-indigo-600" />
                : <Square className="h-4 w-4" />}
              Seleccionar todos ({contacts.length})
            </button>
          </div>

          {/* Kanban board */}
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
                    <div
                      key={c.contact_id}
                      className={`rounded-lg border bg-white p-3 shadow-sm hover:shadow-md transition-shadow ${
                        selected.has(c.contact_id) ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleOne(c.contact_id); }}
                          className="mt-0.5 shrink-0 text-gray-400 hover:text-indigo-600 transition-colors"
                        >
                          {selected.has(c.contact_id)
                            ? <CheckSquare className="h-4 w-4 text-indigo-600" />
                            : <Square className="h-4 w-4" />}
                        </button>
                        <Link to={`/app/leads/${c.contact_id}`} className="block min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-medium text-gray-900 truncate">{c.name}</span>
                            <TierBadge tier={c.tier} />
                          </div>
                          <p className="mt-1 text-xs text-gray-500">{c.phone || c.email || '\u2014'}</p>
                          {c.source_channel && (
                            <p className="mt-1 text-[10px] uppercase text-gray-400">{c.source_channel}</p>
                          )}
                          {c.tags?.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {c.tags.map((tag) => (
                                <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </Link>
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                        <label className="sr-only">Cambiar estado</label>
                        <select
                          value={c.lead_status || 'prospect'}
                          onChange={(e) => handleStatusChange(c.contact_id, e)}
                          disabled={patchContact.isPending}
                          className="w-full rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
                        >
                          {STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {showTagModal && (
        <TagModal
          onConfirm={handleBulkTag}
          onClose={() => setShowTagModal(false)}
        />
      )}
    </div>
  );
}
