import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { createTenant } from '../api/onboarding';
import { useAuth } from '../context/AuthContext';
import GoogleButton from '../components/GoogleButton';

const BUSINESS_TYPE_KEYS = [
  { value: 'restaurant', labelKey: 'signup.businessTypes.restaurant' },
  { value: 'retail', labelKey: 'signup.businessTypes.retail' },
  { value: 'bar', labelKey: 'signup.businessTypes.bar' },
  { value: 'other', labelKey: 'signup.businessTypes.other' },
];

export default function Signup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signIn, signInWithGoogle } = useAuth();
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

  const validatePassword = (pw) => {
    if (pw.length < 8) return t('signup.passwordMinLength');
    if (!/[A-Z]/.test(pw)) return t('signup.passwordNeedsUppercase');
    if (!/[a-z]/.test(pw)) return t('signup.passwordNeedsLowercase');
    if (!/[0-9]/.test(pw)) return t('signup.passwordNeedsNumber');
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const pwError = validatePassword(form.owner_password);
    if (pwError) {
      setError(pwError);
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
            <p className="mt-1 text-xs text-gray-400">{t('signup.passwordHint')}</p>
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">{t('common.orContinueWith')}</span></div>
          </div>

          <GoogleButton onClick={signInWithGoogle} label={t('common.signUpWithGoogle')} />

          <p className="text-center text-sm text-gray-500">
            {t('signup.alreadyHaveAccount')}{' '}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-500">{t('common.signIn')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
