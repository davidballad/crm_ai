import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { createTenant } from '../api/onboarding';
import { useAuth } from '../context/AuthContext';

const BUSINESS_TYPE_KEYS = [
  { value: 'restaurant', labelKey: 'signup.businessTypes.restaurant' },
  { value: 'retail', labelKey: 'signup.businessTypes.retail' },
  { value: 'bar', labelKey: 'signup.businessTypes.bar' },
  { value: 'other', labelKey: 'signup.businessTypes.other' },
];

export default function Signup() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [form, setForm] = useState({
    business_name: '',
    business_type: 'restaurant',
    owner_email: '',
    owner_password: '',
    meta_phone_number_id: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.owner_password.length < 8) {
      setError(t('signup.passwordMinLength'));
      return;
    }
    setSubmitting(true);
    try {
      await createTenant(form);
      await signIn(form.owner_email, form.owner_password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || t('signup.signupFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="absolute right-4 top-4 flex gap-1 text-sm text-gray-600">
        <button type="button" onClick={() => i18n.changeLanguage('en')} className={`rounded px-2 py-1 ${i18n.language === 'en' ? 'bg-brand-100 font-medium text-brand-700' : 'hover:bg-gray-200'}`}>EN</button>
        <button type="button" onClick={() => i18n.changeLanguage('es')} className={`rounded px-2 py-1 ${i18n.language === 'es' ? 'bg-brand-100 font-medium text-brand-700' : 'hover:bg-gray-200'}`}>ES</button>
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex">
            <img src="/mainLogo.png" alt="Clienta AI" className="mx-auto mb-4 h-16 w-auto" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{t('signup.title')}</h1>
          <p className="mt-2 text-sm text-gray-500">{t('signup.tagline')}</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label htmlFor="business_name" className="mb-1 block text-sm font-medium text-gray-700">{t('signup.businessName')}</label>
            <input id="business_name" required value={form.business_name} onChange={update('business_name')} className="input-field" placeholder={t('signup.placeholderBusiness')} />
          </div>

          <div>
            <label htmlFor="business_type" className="mb-1 block text-sm font-medium text-gray-700">{t('signup.businessType')}</label>
            <select id="business_type" value={form.business_type} onChange={update('business_type')} className="input-field">
              {BUSINESS_TYPE_KEYS.map((opt) => <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="owner_email" className="mb-1 block text-sm font-medium text-gray-700">{t('common.email')}</label>
            <input id="owner_email" type="email" required value={form.owner_email} onChange={update('owner_email')} className="input-field" placeholder={t('common.placeholderEmail')} />
          </div>

          <div>
            <label htmlFor="owner_password" className="mb-1 block text-sm font-medium text-gray-700">{t('common.password')}</label>
            <input id="owner_password" type="password" required minLength={8} value={form.owner_password} onChange={update('owner_password')} className="input-field" placeholder={t('signup.placeholderPassword')} />
          </div>

          <div>
            <label htmlFor="meta_phone_number_id" className="mb-1 block text-sm font-medium text-gray-700">
              {t('signup.whatsappPhoneNumberId')}
            </label>
            <input id="meta_phone_number_id" required value={form.meta_phone_number_id} onChange={update('meta_phone_number_id')} className="input-field" placeholder={t('signup.placeholderPhoneId')} />
            <p className="mt-1 text-xs text-gray-400">{t('signup.whatsappHint')}</p>
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t('common.creatingAccount') : t('common.createAccount')}
          </button>

          <p className="text-center text-sm text-gray-500">
            {t('signup.alreadyHaveAccount')}{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-500">{t('common.signIn')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
