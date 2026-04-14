import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const BUSINESS_TYPE_KEYS = [
  { value: 'restaurant', labelKey: 'signup.businessTypes.restaurant' },
  { value: 'retail', labelKey: 'signup.businessTypes.retail' },
  { value: 'bar', labelKey: 'signup.businessTypes.bar' },
  { value: 'other', labelKey: 'signup.businessTypes.other' },
];

export default function GoogleOnboarding() {
  const { t } = useTranslation();
  const { refreshSession, user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    business_name: '',
    business_type: 'restaurant',
    meta_phone_number_id: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/onboarding/google-tenant', form);
      // Refresh the session so the new custom:tenant_id is in the token
      await refreshSession();
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err.message || t('signup.signupFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img src="/mainLogo.png" alt="Clienta AI" className="mx-auto mb-4 h-16 w-auto" />
          <h1 className="text-2xl font-bold text-gray-900">{t('googleOnboarding.title')}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {t('googleOnboarding.tagline', { email: user?.email || '' })}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label htmlFor="business_name" className="mb-1 block text-sm font-medium text-gray-700">{t('signup.businessName')}</label>
            <input
              id="business_name"
              required
              value={form.business_name}
              onChange={update('business_name')}
              className="input-field"
              placeholder={t('signup.placeholderBusiness')}
            />
          </div>

          <div>
            <label htmlFor="business_type" className="mb-1 block text-sm font-medium text-gray-700">{t('signup.businessType')}</label>
            <select id="business_type" value={form.business_type} onChange={update('business_type')} className="input-field">
              {BUSINESS_TYPE_KEYS.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="meta_phone_number_id" className="mb-1 block text-sm font-medium text-gray-700">
              {t('signup.whatsappPhoneNumberId')}
            </label>
            <input
              id="meta_phone_number_id"
              required
              value={form.meta_phone_number_id}
              onChange={update('meta_phone_number_id')}
              className="input-field"
              placeholder={t('signup.placeholderPhoneId')}
            />
            <p className="mt-1 text-xs text-gray-400">{t('signup.whatsappHint')}</p>
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t('common.creatingAccount') : t('googleOnboarding.finish')}
          </button>
        </form>
      </div>
    </div>
  );
}
