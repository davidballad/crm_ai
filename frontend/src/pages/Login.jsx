import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleButton from '../components/GoogleButton';

export default function Login() {
  const { t } = useTranslation();
  const { signIn, signInWithGoogle, isAuthenticated, isDemoMode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';
  const redirectTo = from === '/' || !from ? '/app' : from;

  useEffect(() => {
    if (isAuthenticated) navigate(redirectTo, { replace: true });
  }, [isAuthenticated, navigate, redirectTo]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || 'Sign in failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex">
            <img src="/main.png" alt="Clienta AI" className="mx-auto mb-4 h-16 w-auto" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">{t('login.title')}</h1>
          <p className="mt-2 text-sm text-gray-500">{t('login.tagline')}</p>
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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder={t('common.placeholderEmail')}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">{t('common.password')}</label>
              <Link to="/forgot-password" className="text-xs font-medium text-brand-600 hover:text-brand-500">{t('login.forgotPassword')}</Link>
            </div>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder={t('common.placeholderPassword')}
            />
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t('common.signingIn') : t('common.signIn')}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">{t('common.orContinueWith')}</span></div>
          </div>

          <GoogleButton onClick={signInWithGoogle} label={t('common.signInWithGoogle')} />

          <p className="text-center text-sm text-gray-500">
            {t('login.noAccount')}{' '}
            <Link to="/signup" className="font-medium text-brand-600 hover:text-brand-500">{t('login.createOne')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
