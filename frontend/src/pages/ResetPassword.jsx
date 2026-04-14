import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ResetPassword() {
  const { t } = useTranslation();
  const { confirmForgotPassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', code: '', password: '', confirm: '' });
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
    if (form.password !== form.confirm) {
      setError(t('resetPassword.passwordMismatch'));
      return;
    }
    const pwError = validatePassword(form.password);
    if (pwError) {
      setError(pwError);
      return;
    }
    setSubmitting(true);
    try {
      await confirmForgotPassword(form.email, form.code, form.password);
      navigate('/login', { state: { resetSuccess: true } });
    } catch (err) {
      setError(err.message || t('resetPassword.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex">
            <img src="/mainLogo.png" alt="Clienta AI" className="mx-auto mb-4 h-16 w-auto" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{t('resetPassword.title')}</h1>
          <p className="mt-2 text-sm text-gray-500">{t('resetPassword.tagline')}</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">{t('common.email')}</label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={update('email')}
              className="input-field"
              placeholder={t('common.placeholderEmail')}
            />
          </div>

          <div>
            <label htmlFor="code" className="mb-1 block text-sm font-medium text-gray-700">{t('resetPassword.code')}</label>
            <input
              id="code"
              type="text"
              required
              value={form.code}
              onChange={update('code')}
              className="input-field"
              placeholder={t('resetPassword.codePlaceholder')}
              autoComplete="one-time-code"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">{t('resetPassword.newPassword')}</label>
            <input
              id="password"
              type="password"
              required
              value={form.password}
              onChange={update('password')}
              className="input-field"
              placeholder={t('signup.placeholderPassword')}
            />
            <p className="mt-1 text-xs text-gray-400">{t('signup.passwordHint')}</p>
          </div>

          <div>
            <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-gray-700">{t('resetPassword.confirmPassword')}</label>
            <input
              id="confirm"
              type="password"
              required
              value={form.confirm}
              onChange={update('confirm')}
              className="input-field"
              placeholder={t('resetPassword.confirmPlaceholder')}
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t('resetPassword.resetting') : t('resetPassword.resetButton')}
          </button>

          <p className="text-center text-sm text-gray-500">
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-500">{t('forgotPassword.backToLogin')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
