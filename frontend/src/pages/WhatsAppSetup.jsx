import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { completeSetup, getTenantConfig, patchTenantConfig } from '../api/onboarding';
import { MessageCircle, ExternalLink, Pencil, CheckCircle, Plus, Trash2 } from 'lucide-react';

const normalizePhoneNumber = (value) => String(value || '').replace(/\D/g, '');

export default function WhatsAppSetup() {
  const { t } = useTranslation();
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [businessPhoneNumber, setBusinessPhoneNumber] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaBusinessAccountId, setMetaBusinessAccountId] = useState('');
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');
  const [bankName, setBankName] = useState('');
  const [personName, setPersonName] = useState('');
  const [accountType, setAccountType] = useState('');
  const [accountId, setAccountId] = useState('');
  const [identificationNumber, setIdentificationNumber] = useState('');
  const [sequences, setSequences] = useState([]);
  const [seqSaving, setSeqSaving] = useState(false);
  const [seqSuccess, setSeqSuccess] = useState('');
  const [taxRateInput, setTaxRateInput] = useState(15);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxSuccess, setTaxSuccess] = useState('');
  const [igBusinessAccountId, setIgBusinessAccountId] = useState('');
  const [igAccessToken, setIgAccessToken] = useState('');
  const [igSaving, setIgSaving] = useState(false);
  const [igSuccess, setIgSuccess] = useState('');
  const [igError, setIgError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  const isConnected = !!(config?.meta_phone_number_id);

  useEffect(() => {
    let cancelled = false;
    getTenantConfig()
      .then((data) => { if (!cancelled) setConfig(data); })
      .catch(() => { if (!cancelled) setConfig(null); })
      .finally(() => { if (!cancelled) setConfigLoading(false); });
    return () => { cancelled = true; };
  }, [success]);

  useEffect(() => {
    if (config) {
      setMetaPhoneNumberId(config.meta_phone_number_id || '');
      setBusinessPhoneNumber(normalizePhoneNumber(config.phone_number || config.settings?.phone_number));
      setMetaBusinessAccountId(config.meta_business_account_id || '');
      setAiSystemPrompt(config.ai_system_prompt || '');
      setBankName(config.bank_name || '');
      setPersonName(config.person_name || '');
      setAccountType(config.account_type || '');
      setAccountId(config.account_id || '');
      setIdentificationNumber(config.identification_number || '');
      setSequences(config.follow_up_sequences || []);
      if (config.tax_rate != null) setTaxRateInput(Number(config.tax_rate));
      setIgBusinessAccountId(config.ig_business_account_id || '');
      // Do NOT set igAccessToken or metaAccessToken — never returned by API
    }
  }, [config]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const id = (metaPhoneNumberId || '').trim();
    if (!id) {
      setError('El ID de numero de telefono de Meta es obligatorio.');
      return;
    }
    setSubmitting(true);
    try {
      await completeSetup({
        meta_phone_number_id: id,
        ...(normalizePhoneNumber(businessPhoneNumber) && { phone_number: normalizePhoneNumber(businessPhoneNumber) }),
        ...(metaBusinessAccountId.trim() && { meta_business_account_id: metaBusinessAccountId.trim() }),
        ...(metaAccessToken.trim() && { meta_access_token: metaAccessToken.trim() }),
        ...(aiSystemPrompt.trim() && { ai_system_prompt: aiSystemPrompt.trim() }),
        ...(bankName.trim() && { bank_name: bankName.trim() }),
        ...(personName.trim() && { person_name: personName.trim() }),
        ...(accountType.trim() && { account_type: accountType.trim() }),
        ...(accountId.trim() && { account_id: accountId.trim() }),
        ...(identificationNumber.trim() && { identification_number: identificationNumber.trim() }),
      });
      setSuccess(t('whatsapp.successLinked'));
      setEditing(false);
    } catch (err) {
      setError(err.message || t('whatsapp.setupFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (configLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const showForm = editing || !isConnected;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Conectar WhatsApp</h1>
        <p className="text-sm text-gray-500">
          Vincula tu numero de WhatsApp de Meta a este negocio para que el flujo de n8n enrute los mensajes aqui.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <img src="/whatsapp-glyph.svg" alt="" className="h-8 w-8 object-contain" width={32} height={32} loading="lazy" decoding="async" />
          <span className="text-sm font-medium text-gray-700">WhatsApp Business</span>
        </div>
      </div>

      {/* Follow-up sequence editor */}
      <div className="mt-6 card max-w-xl">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Secuencias de seguimiento</h2>
        <p className="mb-4 text-xs text-gray-500">
          Define mensajes automáticos que se envían si un cliente no completa su pedido. El flujo de n8n los ejecutará en orden.
        </p>

        {seqSuccess && <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{seqSuccess}</div>}

        <div className="space-y-3">
          {sequences.map((seq, i) => (
            <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">Paso {i + 1}</span>
                <button
                  type="button"
                  onClick={() => setSequences((s) => s.filter((_, j) => j !== i))}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Esperar (horas)</label>
                  <input
                    type="number"
                    min="1"
                    value={seq.delay_hours}
                    onChange={(e) => setSequences((s) => s.map((item, j) => j === i ? { ...item, delay_hours: Number(e.target.value) } : item))}
                    className="input-field w-full"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={!!seq.mark_abandoned_after}
                      onChange={(e) => setSequences((s) => s.map((item, j) => j === i ? { ...item, mark_abandoned_after: e.target.checked } : item))}
                      className="rounded"
                    />
                    Marcar como abandonado
                  </label>
                </div>
              </div>
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-gray-600">Mensaje (usa {'{{name}}'} para el nombre)</label>
                <textarea
                  value={seq.message || ''}
                  onChange={(e) => setSequences((s) => s.map((item, j) => j === i ? { ...item, message: e.target.value } : item))}
                  rows={2}
                  className="input-field w-full resize-y text-sm"
                  placeholder="Hola {{name}}, ¿sigues interesado?"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setSequences((s) => [...s, { delay_hours: 2, message: '', mark_abandoned_after: false }])}
            className="btn-secondary inline-flex items-center gap-1.5 text-sm"
          >
            <Plus className="h-4 w-4" /> Agregar paso
          </button>
          <button
            type="button"
            disabled={seqSaving}
            onClick={async () => {
              setSeqSaving(true);
              setSeqSuccess('');
              try {
                await patchTenantConfig({ follow_up_sequences: sequences });
                setSeqSuccess('Secuencias guardadas correctamente.');
              } catch {
                /* ignore */
              } finally {
                setSeqSaving(false);
              }
            }}
            className="btn-primary text-sm"
          >
            {seqSaving ? 'Guardando...' : 'Guardar secuencias'}
          </button>
        </div>
      </div>

      {/* Instagram integration */}
      <div className="mt-6 card max-w-xl">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Instagram → WhatsApp</h2>
        <p className="mb-4 text-xs text-gray-500">
          Cuando alguien comente en tus posts de Instagram, el flujo de n8n responderá automáticamente con tu enlace de WhatsApp. Obtén el ID de cuenta y el token desde Meta Business Suite.
        </p>

        {igSuccess && <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{igSuccess}</div>}
        {igError && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{igError}</div>}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              ID de cuenta de Instagram Business
            </label>
            <input
              type="text"
              value={igBusinessAccountId}
              onChange={(e) => setIgBusinessAccountId(e.target.value)}
              placeholder="Ej: 17841400000000000"
              className="input-field w-full font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">Meta Business Suite → tu cuenta de Instagram → ID numérico</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Token de acceso de página (con permiso instagram_manage_comments)
            </label>
            <input
              type="password"
              value={igAccessToken}
              onChange={(e) => setIgAccessToken(e.target.value)}
              placeholder="Dejar en blanco para mantener el actual"
              className="input-field w-full font-mono text-sm"
              autoComplete="off"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={igSaving}
          onClick={async () => {
            setIgSaving(true);
            setIgSuccess('');
            setIgError('');
            try {
              await patchTenantConfig({
                ...(igBusinessAccountId.trim() && { ig_business_account_id: igBusinessAccountId.trim() }),
                ...(igAccessToken.trim() && { ig_access_token: igAccessToken.trim() }),
              });
              setIgSuccess('Configuración de Instagram guardada.');
              setIgAccessToken('');
            } catch {
              setIgError('No se pudo guardar. Intenta de nuevo.');
            } finally {
              setIgSaving(false);
            }
          }}
          className="mt-3 btn-primary text-sm"
        >
          {igSaving ? 'Guardando...' : 'Guardar Instagram'}
        </button>
      </div>

      <div className="card max-w-xl">
        {isConnected && !showForm ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Conectado</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-secondary inline-flex items-center gap-1.5 text-sm"
              >
                <Pencil className="h-4 w-4" /> Editar
              </button>
            </div>
            <p className="text-sm text-gray-600">
              ID del numero de telefono: <code className="rounded bg-gray-100 px-1.5 py-0.5">{config.meta_phone_number_id}</code>
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {t('whatsapp.supportPhoneDisplay')}: <code className="rounded bg-gray-100 px-1.5 py-0.5">{normalizePhoneNumber(config.phone_number || config.settings?.phone_number) || '—'}</code>
            </p>
            {config.meta_business_account_id && (
              <p className="mt-1 text-sm text-gray-600">
                ID de cuenta de negocio: <code className="rounded bg-gray-100 px-1.5 py-0.5">{config.meta_business_account_id}</code>
              </p>
            )}
            <p className="mt-1 text-sm text-gray-500">Token configurado (no se muestra por seguridad).</p>
            {config.ai_system_prompt && (
              <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                Prompt de IA: {config.ai_system_prompt}
              </p>
            )}
            {(config.bank_name || config.person_name || config.account_type || config.account_id || config.identification_number) && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                <p className="font-medium text-gray-800">Datos de transferencia bancaria configurados</p>
                {config.bank_name && <p className="mt-1">Banco: {config.bank_name}</p>}
                {config.person_name && <p>Nombre: {config.person_name}</p>}
                {config.account_type && <p>Tipo de cuenta: {config.account_type}</p>}
                {config.account_id && <p>ID de cuenta: {config.account_id}</p>}
                {config.identification_number && <p>Identificacion: {config.identification_number}</p>}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              <h2 className="text-sm font-semibold text-gray-900">
                {isConnected ? 'Actualizar configuracion' : 'Vincular numero'}
              </h2>
            </div>

        <p className="mb-4 text-sm text-gray-600">
          Obtiene tu <strong>ID del numero de telefono</strong> desde{' '}
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-600 hover:underline"
          >
            Meta for Developers
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          → tu App → WhatsApp → Configuracion de API → Numeros de telefono. Copia el ID numerico (ej. 106540352242922).
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          {success && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>
          )}

          <div>
            <label htmlFor="meta_phone_number_id" className="mb-1 block text-sm font-medium text-gray-700">
              ID del numero de telefono de Meta <span className="text-red-500">*</span>
            </label>
            <input
              id="meta_phone_number_id"
              type="text"
              value={metaPhoneNumberId}
              onChange={(e) => setMetaPhoneNumberId(e.target.value)}
              placeholder="ej. 106540352242922"
              className="input-field w-full"
              required
            />
          </div>

          <div>
            <label htmlFor="business_phone_number" className="mb-1 block text-sm font-medium text-gray-700">
              {t('whatsapp.supportPhoneLabel')}
            </label>
            <input
              id="business_phone_number"
              type="text"
              value={businessPhoneNumber}
              onChange={(e) => setBusinessPhoneNumber(normalizePhoneNumber(e.target.value))}
              placeholder="ej. 593999999999"
              className="input-field w-full"
              inputMode="numeric"
              pattern="[0-9]*"
            />
            <p className="mt-1 text-xs text-gray-500">
              Formato: codigo de pais + numero, solo digitos (sin +, espacios o guiones).
            </p>
          </div>

          <div>
            <label htmlFor="meta_access_token" className="mb-1 block text-sm font-medium text-gray-700">
              Token de acceso de Meta
            </label>
            <input
              id="meta_access_token"
              type="password"
              value={metaAccessToken}
              onChange={(e) => setMetaAccessToken(e.target.value)}
              placeholder={isConnected ? 'Dejar en blanco para mantener el actual' : 'Desde Meta App → WhatsApp → API'}
              className="input-field w-full"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-gray-500">
              Desde Meta App → WhatsApp → API → Token temporal o de usuario del sistema. Deja en blanco para mantener el actual.
            </p>
          </div>

          <div>
            <label htmlFor="meta_business_account_id" className="mb-1 block text-sm font-medium text-gray-700">
              ID de cuenta de WhatsApp Business
            </label>
            <input
              id="meta_business_account_id"
              type="text"
              value={metaBusinessAccountId}
              onChange={(e) => setMetaBusinessAccountId(e.target.value)}
              placeholder="ej. 102290129340398"
              className="input-field w-full"
            />
            <p className="mt-1 text-xs text-gray-500">
              Desde Meta Business Suite → WhatsApp Manager → Numeros de telefono (ID de cuenta).
            </p>
          </div>

          <div>
            <label htmlFor="ai_system_prompt" className="mb-1 block text-sm font-medium text-gray-700">
              Prompt de IA para "Algo mas" (opcional)
            </label>
            <textarea
              id="ai_system_prompt"
              value={aiSystemPrompt}
              onChange={(e) => setAiSystemPrompt(e.target.value)}
              placeholder="Eres un asistente util para tienda..."
              rows={3}
              className="input-field w-full resize-y"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Datos bancarios</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="bank_name" className="mb-1 block text-sm font-medium text-gray-700">Nombre del banco</label>
                <input id="bank_name" type="text" value={bankName} onChange={(e) => setBankName(e.target.value)} className="input-field w-full" />
              </div>
              <div>
                <label htmlFor="person_name" className="mb-1 block text-sm font-medium text-gray-700">Nombre de la persona</label>
                <input id="person_name" type="text" value={personName} onChange={(e) => setPersonName(e.target.value)} className="input-field w-full" />
              </div>
              <div>
                <label htmlFor="account_type" className="mb-1 block text-sm font-medium text-gray-700">Tipo de cuenta</label>
                <input id="account_type" type="text" value={accountType} onChange={(e) => setAccountType(e.target.value)} className="input-field w-full" />
              </div>
              <div>
                <label htmlFor="account_id" className="mb-1 block text-sm font-medium text-gray-700">ID de cuenta</label>
                <input id="account_id" type="text" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="input-field w-full" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="identification_number" className="mb-1 block text-sm font-medium text-gray-700">Numero de identificacion</label>
                <input id="identification_number" type="text" value={identificationNumber} onChange={(e) => setIdentificationNumber(e.target.value)} className="input-field w-full" />
              </div>
            </div>
          </div>

              <div className="flex gap-2">
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? 'Guardando...' : isConnected ? 'Actualizar' : 'Vincular WhatsApp'}
                </button>
                {isConnected && (
                  <button type="button" onClick={() => { setEditing(false); setError(''); setSuccess(''); }} className="btn-secondary">
                    {t('whatsapp.cancel')}
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
