import { useState, useEffect } from 'react';
import { completeSetup, getTenantConfig } from '../api/onboarding';
import { MessageCircle, ExternalLink, Pencil, CheckCircle } from 'lucide-react';

export default function WhatsAppSetup() {
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaBusinessAccountId, setMetaBusinessAccountId] = useState('');
  const [aiSystemPrompt, setAiSystemPrompt] = useState('');
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
      setMetaBusinessAccountId(config.meta_business_account_id || '');
      setAiSystemPrompt(config.ai_system_prompt || '');
      // Do NOT set metaAccessToken from config — it is never returned
    }
  }, [config]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const id = (metaPhoneNumberId || '').trim();
    if (!id) {
      setError('Meta Phone number ID is required.');
      return;
    }
    setSubmitting(true);
    try {
      await completeSetup({
        meta_phone_number_id: id,
        ...(metaBusinessAccountId.trim() && { meta_business_account_id: metaBusinessAccountId.trim() }),
        ...(metaAccessToken.trim() && { meta_access_token: metaAccessToken.trim() }),
        ...(aiSystemPrompt.trim() && { ai_system_prompt: aiSystemPrompt.trim() }),
      });
      setSuccess('WhatsApp is linked. n8n can now resolve your business when messages arrive.');
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Setup failed');
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
        <h1 className="text-xl font-bold text-gray-900">Connect WhatsApp</h1>
        <p className="text-sm text-gray-500">
          Link your Meta WhatsApp number to this business so the n8n workflow can route messages here.
        </p>
        <div className="mt-4">
          <img src="/meta-lockup.svg" alt="Meta" className="h-5 w-auto object-contain" loading="lazy" />
        </div>
      </div>

      <div className="card max-w-xl">
        {isConnected && !showForm ? (
          <>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <h2 className="text-sm font-semibold text-gray-900">Connected</h2>
              </div>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="btn-secondary inline-flex items-center gap-1.5 text-sm"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            </div>
            <p className="text-sm text-gray-600">
              Phone number ID: <code className="rounded bg-gray-100 px-1.5 py-0.5">{config.meta_phone_number_id}</code>
            </p>
            {config.meta_business_account_id && (
              <p className="mt-1 text-sm text-gray-600">
                Business Account ID: <code className="rounded bg-gray-100 px-1.5 py-0.5">{config.meta_business_account_id}</code>
              </p>
            )}
            <p className="mt-1 text-sm text-gray-500">Token configured (not shown for security).</p>
            {config.ai_system_prompt && (
              <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                AI prompt: {config.ai_system_prompt}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="mb-4 flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-green-600" />
              <h2 className="text-sm font-semibold text-gray-900">
                {isConnected ? 'Update settings' : 'Link phone number'}
              </h2>
            </div>

        <p className="mb-4 text-sm text-gray-600">
          Get your <strong>Phone number ID</strong> from{' '}
          <a
            href="https://developers.facebook.com/apps"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-600 hover:underline"
          >
            Meta for Developers
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          → your App → WhatsApp → API Setup → Phone numbers. Copy the numeric ID (e.g. 106540352242922).
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
              Meta Phone number ID <span className="text-red-500">*</span>
            </label>
            <input
              id="meta_phone_number_id"
              type="text"
              value={metaPhoneNumberId}
              onChange={(e) => setMetaPhoneNumberId(e.target.value)}
              placeholder="e.g. 106540352242922"
              className="input-field w-full"
              required
            />
          </div>

          <div>
            <label htmlFor="meta_access_token" className="mb-1 block text-sm font-medium text-gray-700">
              Meta Access Token
            </label>
            <input
              id="meta_access_token"
              type="password"
              value={metaAccessToken}
              onChange={(e) => setMetaAccessToken(e.target.value)}
              placeholder={isConnected ? 'Leave blank to keep existing' : 'From Meta App → WhatsApp → API'}
              className="input-field w-full"
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-gray-500">
              From Meta App → WhatsApp → API → Temporary or System User token. Leave blank to keep existing.
            </p>
          </div>

          <div>
            <label htmlFor="meta_business_account_id" className="mb-1 block text-sm font-medium text-gray-700">
              WhatsApp Business Account ID
            </label>
            <input
              id="meta_business_account_id"
              type="text"
              value={metaBusinessAccountId}
              onChange={(e) => setMetaBusinessAccountId(e.target.value)}
              placeholder="e.g. 102290129340398"
              className="input-field w-full"
            />
            <p className="mt-1 text-xs text-gray-500">
              From Meta Business Suite → WhatsApp Manager → Phone numbers (Account ID).
            </p>
          </div>

          <div>
            <label htmlFor="ai_system_prompt" className="mb-1 block text-sm font-medium text-gray-700">
              AI prompt for “Something else” (optional)
            </label>
            <textarea
              id="ai_system_prompt"
              value={aiSystemPrompt}
              onChange={(e) => setAiSystemPrompt(e.target.value)}
              placeholder="You are a helpful store assistant for..."
              rows={3}
              className="input-field w-full resize-y"
            />
          </div>

              <div className="flex gap-2">
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting ? 'Saving…' : isConnected ? 'Update' : 'Link WhatsApp'}
                </button>
                {isConnected && (
                  <button type="button" onClick={() => { setEditing(false); setError(''); setSuccess(''); }} className="btn-secondary">
                    Cancel
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
