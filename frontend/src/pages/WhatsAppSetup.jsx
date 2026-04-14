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
  const [taxRateInput, setTaxRateInput] = useState(15);
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxSuccess, setTaxSuccess] = useState('');
  const [igBusinessAccountId, setIgBusinessAccountId] = useState('');
  const [igAccessToken, setIgAccessToken] = useState('');
  const [igSaving, setIgSaving] = useState(false);
  const [igSuccess, setIgSuccess] = useState('');
  const [igError, setIgError] = useState('');
  const [datafastEntityId, setDatafastEntityId] = useState('');
  const [datafastApiToken, setDatafastApiToken] = useState('');
  const [datafastSaving, setDatafastSaving] = useState(false);
  const [datafastSuccess, setDatafastSuccess] = useState('');
  const [datafastError, setDatafastError] = useState('');
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [deliverySuccess, setDeliverySuccess] = useState('');
  const [supportPhone, setSupportPhone] = useState('');
  const [supportPhoneSaving, setSupportPhoneSaving] = useState(false);
  const [supportPhoneSuccess, setSupportPhoneSuccess] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [storeSlugSaving, setStoreSlugSaving] = useState(false);
  const [storeSlugSuccess, setStoreSlugSuccess] = useState('');
  const [storeSlugError, setStoreSlugError] = useState('');
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
      setSupportPhone(config.support_phone || '');
      if (config.tax_rate != null) setTaxRateInput(Number(config.tax_rate));
      setIgBusinessAccountId(config.ig_business_account_id || '');
      setDatafastEntityId(config.datafast_entity_id || '');
      setStoreSlug(config.store_slug || '');
      setDeliveryEnabled(config.delivery_enabled !== false);
      // Do NOT set igAccessToken, metaAccessToken, or datafastApiToken — never returned by API
    }
  }, [config]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const id = (metaPhoneNumberId || '').trim();
    if (!id) {
      setError('El ID de número de teléfono de Meta es obligatorio.');
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
          Vincula tu número de WhatsApp de Meta a este negocio para que nuestra plataforma enrute los mensajes aquí.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <img src="/whatsapp-glyph.svg" alt="" className="h-8 w-8 object-contain" width={32} height={32} loading="lazy" decoding="async" />
          <span className="text-sm font-medium text-gray-700">WhatsApp Business</span>
        </div>
      </div>


      {/* Instagram integration */}
      <div className="mt-6 card max-w-xl">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Instagram → WhatsApp</h2>
        <p className="mb-4 text-xs text-gray-500">
          Cuando alguien comente en tus posts de Instagram, nuestra plataforma responderá automáticamente con tu enlace de WhatsApp. Obtén el ID de cuenta y el token desde Meta Business Suite.
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
                ig_business_account_id: igBusinessAccountId.trim() || null,
                ig_access_token: igAccessToken.trim() || null,
              });
              setIgSuccess('Configuración de Instagram guardada.');
              setConfig(prev => ({ ...prev, ig_business_account_id: igBusinessAccountId.trim() }));
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

      {/* Datafast card payment integration */}
      <div className="mt-6 card max-w-xl">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Pago con tarjeta (Datafast)</h2>
        <p className="mb-4 text-xs text-gray-500">
          Permite que tus clientes paguen con tarjeta de crédito/débito en tu tienda online. Obtén tu Entity ID y token desde el portal Datafast.
        </p>

        {datafastSuccess && <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{datafastSuccess}</div>}
        {datafastError && <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{datafastError}</div>}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Entity ID</label>
            <input
              type="text"
              value={datafastEntityId}
              onChange={(e) => setDatafastEntityId(e.target.value)}
              placeholder="Ej: 8a8294185..."
              className="input-field w-full font-mono text-sm"
            />
            <p className="mt-1 text-xs text-gray-400">Portal Datafast → tu cuenta de comercio → Entity ID</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Token de acceso</label>
            <input
              type="password"
              value={datafastApiToken}
              onChange={(e) => setDatafastApiToken(e.target.value)}
              placeholder="Dejar en blanco para mantener el actual"
              className="input-field w-full font-mono text-sm"
              autoComplete="off"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={datafastSaving}
          onClick={async () => {
            setDatafastSaving(true);
            setDatafastSuccess('');
            setDatafastError('');
            try {
              await patchTenantConfig({
                datafast_entity_id: datafastEntityId.trim() || null,
                datafast_api_token: datafastApiToken.trim() || null,
              });
              setDatafastSuccess('Configuración de Datafast guardada.');
              setConfig(prev => ({ ...prev, datafast_entity_id: datafastEntityId.trim() }));
              setDatafastApiToken('');
            } catch {
              setDatafastError('No se pudo guardar. Intenta de nuevo.');
            } finally {
              setDatafastSaving(false);
            }
          }}
          className="mt-3 btn-primary text-sm"
        >
          {datafastSaving ? 'Guardando...' : 'Guardar Datafast'}
        </button>
      </div>

      {/* Delivery option */}
      <div className="mt-6 card max-w-xl">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">Envío a domicilio</h2>
        <p className="mb-4 text-xs text-gray-500">
          Activa o desactiva la opción de entrega a domicilio en tu tienda online. Si está desactivada, los clientes solo podrán elegir retiro en tienda.
        </p>

        {deliverySuccess && <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{deliverySuccess}</div>}

        <label className="flex cursor-pointer items-center gap-3">
          <div className="relative">
            <input
              type="checkbox"
              className="sr-only"
              checked={deliveryEnabled}
              onChange={(e) => setDeliveryEnabled(e.target.checked)}
            />
            <div className={`h-6 w-11 rounded-full transition-colors ${deliveryEnabled ? 'bg-brand-600' : 'bg-gray-300'}`} />
            <div className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${deliveryEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
          <span className="text-sm text-gray-700">{deliveryEnabled ? 'Envío habilitado' : 'Solo retiro en tienda'}</span>
        </label>

        <button
          type="button"
          disabled={deliverySaving}
          onClick={async () => {
            setDeliverySaving(true);
            setDeliverySuccess('');
            try {
              await patchTenantConfig({ delivery_enabled: deliveryEnabled });
              setDeliverySuccess('Configuración de envío guardada.');
              setConfig(prev => ({ ...prev, delivery_enabled: deliveryEnabled }));
            } catch {
              /* ignore */
            } finally {
              setDeliverySaving(false);
            }
          }}
          className="mt-3 btn-primary text-sm"
        >
          {deliverySaving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>

      {/* Support phone for bot escalation */}
      <div className="mt-6 card max-w-xl">
        <h2 className="mb-1 text-sm font-semibold text-gray-900">{t('whatsapp.handoffTitle')}</h2>
        <p className="mb-4 text-xs text-gray-500">
          {t('whatsapp.handoffDesc')}
        </p>

        {supportPhoneSuccess && <div className="mb-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{supportPhoneSuccess}</div>}

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            {t('whatsapp.handoffLabel')}
          </label>
          <input
            type="text"
            value={supportPhone}
            onChange={(e) => setSupportPhone(normalizePhoneNumber(e.target.value))}
            placeholder="Ej: 593999999999"
            className="input-field w-full font-mono text-sm"
            inputMode="numeric"
            pattern="[0-9]*"
          />
          <p className="mt-1 text-xs text-gray-400">{t('whatsapp.handoffHint')}</p>
        </div>

        <button
          type="button"
          disabled={supportPhoneSaving}
          onClick={async () => {
            setSupportPhoneSaving(true);
            setSupportPhoneSuccess('');
            try {
              await patchTenantConfig({ support_phone: supportPhone.trim() });
              setSupportPhoneSuccess(t('whatsapp.handoffSuccess'));
              setConfig(prev => ({ ...prev, support_phone: supportPhone.trim() }));
            } catch {
              /* ignore */
            } finally {
              setSupportPhoneSaving(false);
            }
          }}
          className="mt-3 btn-primary text-sm"
        >
          {supportPhoneSaving ? t('whatsapp.saving') : t('whatsapp.handoffSave')}
        </button>
      </div>

      {/* Shareable store link & URL Slug management */}
      {config?.id && (
        <div className="mt-6 card max-w-xl">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Enlace de tu tienda</h2>
          <p className="mb-3 text-xs text-gray-500">
            Comparte este enlace en Instagram, Facebook o WhatsApp. Cuando alguien lo abra, verá tu perfil de negocio.
          </p>
          
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-gray-600">Nombre personalizado (URL)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">clientaai.com/store/</span>
                <input
                  type="text"
                  value={storeSlug}
                  onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  className="input-field w-full pl-[112px] font-mono text-sm"
                  placeholder="mi-negocio"
                />
              </div>
              <button
                type="button"
                disabled={storeSlugSaving || !storeSlug}
                onClick={async () => {
                  setStoreSlugSaving(true);
                  setStoreSlugSuccess('');
                  setStoreSlugError('');
                  try {
                    await patchTenantConfig({ store_slug: storeSlug.trim() });
                    setStoreSlugSuccess('Enlace actualizado correctamente.');
                    // Update the local config so the copy button below uses the new slug
                    setConfig(prev => ({ ...prev, store_slug: storeSlug.trim() }));
                  } catch (err) {
                    setStoreSlugError(err.message || 'Error al actualizar el nombre.');
                  } finally {
                    setStoreSlugSaving(false);
                  }
                }}
                className="btn-primary shrink-0 text-xs"
              >
                {storeSlugSaving ? '...' : 'Actualizar'}
              </button>
            </div>
            {storeSlugSuccess && <p className="mt-1 text-[11px] text-green-600">✅ {storeSlugSuccess}</p>}
            {storeSlugError && <p className="mt-1 text-[11px] text-red-600">❌ {storeSlugError}</p>}
            <p className="mt-1 text-[11px] text-gray-400">Solo letras minúsculas, números y guiones.</p>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <code className="flex-1 truncate text-xs text-gray-700">
              https://www.clientaai.com/store/{config.store_slug || config.id}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(`https://www.clientaai.com/store/${config.store_slug || config.id}`);
              }}
              className="shrink-0 rounded-md bg-white px-2 py-1 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-200 hover:bg-gray-100"
            >
              Copiar
            </button>
          </div>
        </div>
      )}

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
              ID del número de teléfono: <code className="rounded bg-gray-100 px-1.5 py-0.5">{config.meta_phone_number_id}</code>
            </p>
            <p className="mt-1 text-sm text-gray-600">
              {t('whatsapp.supportPhoneDisplay')}: <code className="rounded bg-gray-100 px-1.5 py-0.5">{normalizePhoneNumber(config.phone_number || config.settings?.phone_number) || '—'}</code>
            </p>
            {config.support_phone && (
              <p className="mt-1 text-sm text-gray-600">
                {t('whatsapp.handoffLabel')}: <code className="rounded bg-gray-100 px-1.5 py-0.5">{config.support_phone}</code>
              </p>
            )}
            {config.meta_business_account_id && (
              <p className="mt-1 text-sm text-gray-600">
                ID de cuenta de negocio: <code className="rounded bg-gray-100 px-1.5 py-0.5">{config.meta_business_account_id}</code>
              </p>
            )}
            <p className="mt-1 text-sm text-gray-500">Token configurado (no se muestra por seguridad).</p>
            {config.ai_system_prompt && (
              <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                {t('whatsapp.aiPromptPrefix')}: {config.ai_system_prompt}
              </p>
            )}
            {(config.bank_name || config.person_name || config.account_type || config.account_id || config.identification_number) && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
                <p className="font-medium text-gray-800">Datos de transferencia bancaria configurados</p>
                {config.bank_name && <p className="mt-1">Banco: {config.bank_name}</p>}
                {config.person_name && <p>Nombre: {config.person_name}</p>}
                {config.account_type && <p>Tipo de cuenta: {config.account_type}</p>}
                {config.account_id && <p>ID de cuenta: {config.account_id}</p>}
                {config.identification_number && <p>Identificación: {config.identification_number}</p>}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              <h2 className="text-sm font-semibold text-gray-900">
                {isConnected ? 'Actualizar configuración' : 'Vincular número'}
              </h2>
            </div>

        <p className="mb-4 text-sm text-gray-600">
          Obtén tu <strong>ID del número de teléfono</strong> desde{' '}
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-600 hover:underline"
          >
            Meta for Developers
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          → tu App → WhatsApp → Configuración de API → Números de teléfono. Copia el ID numérico (ej. 106540352242922).
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
              ID del número de teléfono de Meta <span className="text-red-500">*</span>
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
              {t('whatsapp.mainPhoneLabel')}
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
              {t('whatsapp.mainPhoneHint')}
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
              Desde Meta Business Suite → WhatsApp Manager → Números de teléfono (ID de cuenta).
            </p>
          </div>

          <div>
            <label htmlFor="ai_system_prompt" className="mb-1 block text-sm font-medium text-gray-700">
              Prompt de IA para "Algo más" (opcional)
            </label>
            <textarea
              id="ai_system_prompt"
              value={aiSystemPrompt}
              onChange={(e) => setAiSystemPrompt(e.target.value)}
              placeholder="Eres un asistente útil para tienda..."
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
                <label htmlFor="identification_number" className="mb-1 block text-sm font-medium text-gray-700">Número de identificación</label>
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
