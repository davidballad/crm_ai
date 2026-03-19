import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Package,
  MessageSquare,
  BarChart3,
  Users,
  ShoppingCart,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { submitContact } from '../api/contact';

const FEATURE_ICONS = [Package, MessageSquare, BarChart3, Users, ShoppingCart];

const SUBJECT_COLLABORATION = 'Collaboration';
const SUBJECT_PRICING = 'Pricing inquiry';

export default function Landing() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, loading } = useAuth();
  const [contactSubject, setContactSubject] = useState(SUBJECT_COLLABORATION);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState(null);

  const scrollToContact = () => {
    document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' });
  };

  const openPricingForm = () => {
    setContactSubject(SUBJECT_PRICING);
    setFormError(null);
    setSent(false);
    scrollToContact();
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await submitContact({
        name: formName,
        email: formEmail,
        message: formMessage,
        subject: contactSubject,
      });
      setSent(true);
      setFormName('');
      setFormEmail('');
      setFormMessage('');
      setContactSubject(SUBJECT_COLLABORATION);
    } catch (err) {
      setFormError(t('landing.collaborate.formError'));
    } finally {
      setSubmitting(false);
    }
  };
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/app" replace />;

  return (
    <div className="min-h-screen bg-white">
      {/* Top nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <img src="/mainLogo.png" alt="Clienta AI" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <a href="#pricing" className="hidden sm:inline text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              {t('landing.nav.pricing')}
            </a>
            <span className="flex gap-1 text-sm text-gray-500">
              <button type="button" onClick={() => i18n.changeLanguage('en')} className={`rounded px-2 py-0.5 ${i18n.language === 'en' ? 'bg-brand-100 font-medium text-brand-700' : 'hover:bg-gray-100'}`}>EN</button>
              <button type="button" onClick={() => i18n.changeLanguage('es')} className={`rounded px-2 py-0.5 ${i18n.language === 'es' ? 'bg-brand-100 font-medium text-brand-700' : 'hover:bg-gray-100'}`}>ES</button>
            </span>
            <Link
              to="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              {t('landing.nav.logIn')}
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              {t('landing.nav.signUp')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-16 sm:pt-36 sm:pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-brand-600">
            {t('landing.hero.badge')}
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            {t('landing.hero.title')}
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-gray-600">
            {t('landing.hero.subtitle')}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/signup"
              className="rounded-lg bg-brand-600 px-6 py-3 text-base font-medium text-white shadow-md hover:bg-brand-700 transition-colors"
            >
              {t('landing.hero.getStarted')}
            </Link>
            <Link
              to="/login"
              className="rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('landing.hero.logIn')}
            </Link>
          </div>
        </div>
      </section>

      {/* Trust: security + powered by */}
      <section className="border-t border-gray-100 bg-gray-50/50 py-12 sm:py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-10 sm:gap-12">
            <div className="flex flex-col items-center gap-3 text-center max-w-xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-700">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">{t('landing.trust.title')}</h2>
              <p className="text-sm text-gray-600">{t('landing.trust.subtitle')}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
              <a
                href="https://about.meta.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-gray-500 hover:text-gray-700 transition-colors"
                title="Meta"
              >
                <img src="/meta-lockup.png" alt="Meta" className="h-8 w-auto object-contain" />
              </a>
              <a
                href="https://aws.amazon.com/what-is-cloud-computing"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 opacity-90 hover:opacity-100 transition-opacity"
                title="Powered by Amazon Web Services"
              >
                <img
                  src="https://d0.awsstatic.com/logos/powered-by-aws.png"
                  alt="Powered by AWS"
                  className="h-6 w-auto"
                />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* What we offer */}
      <section className="border-t border-gray-100 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center">{t('landing.offers.title')}</h2>
          <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto">
            {t('landing.offers.subtitle')}
          </p>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_ICONS.map((Icon, i) => (
              <div
                key={i}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">{t(`landing.offers.feature${i}Title`)}</h3>
                <p className="mt-2 text-sm text-gray-600 leading-relaxed">{t(`landing.offers.feature${i}Desc`)}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              to="/signup"
              className="inline-flex rounded-lg bg-brand-600 px-6 py-3 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              {t('landing.hero.getStarted')}
            </Link>
          </div>
        </div>
      </section>

      {/* Collaborators & contact form */}
      <section id="contact" className="border-t border-gray-100 py-20 scroll-mt-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center">{t('landing.collaborate.title')}</h2>
          <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto">
            {t('landing.collaborate.subtitle')}
          </p>
          <div className="mt-10 max-w-lg mx-auto">
            {sent ? (
              <p className="text-center text-green-700 font-medium">{t('landing.collaborate.formSuccess')}</p>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4">
                {contactSubject === SUBJECT_PRICING && (
                  <p className="text-sm text-brand-600 font-medium">{t('landing.collaborate.formSubjectPricing')}</p>
                )}
                <div>
                  <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700">
                    {t('landing.collaborate.formName')} *
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-sm font-medium text-gray-700">
                    {t('landing.collaborate.formEmail')} *
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label htmlFor="contact-message" className="block text-sm font-medium text-gray-700">
                    {t('landing.collaborate.formMessage')} *
                  </label>
                  <textarea
                    id="contact-message"
                    required
                    rows={4}
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                {formError && <p className="text-sm text-red-600">{formError}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? t('landing.collaborate.formSending') : t('landing.collaborate.formSubmit')}
                </button>
              </form>
            )}
            <p className="mt-4 text-center text-sm text-gray-500">{t('landing.collaborate.contactNote')}</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-gray-100 bg-gray-50/50 py-20" id="pricing">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 text-center">{t('landing.pricing.title')}</h2>
          <p className="mt-3 text-center text-gray-600 max-w-2xl mx-auto">
            {t('landing.pricing.subtitle')}
          </p>
          <div className="mt-14 grid gap-8 sm:grid-cols-2 max-w-3xl mx-auto">
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <h3 className="text-xl font-semibold text-gray-900">{t('landing.pricing.starterName')}</h3>
              <p className="mt-1 text-2xl font-bold text-brand-600">{t('landing.pricing.starterPrice')}</p>
              <p className="mt-2 text-sm text-gray-600">{t('landing.pricing.starterDesc')}</p>
              <ul className="mt-6 space-y-3">
                {['featureInv', 'featureLeads', 'featureAI', 'featureWhatsApp'].map((k) => (
                  <li key={k} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 shrink-0 text-green-600" />
                    {t(`landing.pricing.${k}`)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={openPricingForm}
                className="mt-6 block w-full rounded-lg border border-brand-600 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors"
              >
                {t('landing.pricing.contactForPricing')}
              </button>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
              <h3 className="text-xl font-semibold text-gray-900">{t('landing.pricing.growthName')}</h3>
              <p className="mt-1 text-2xl font-bold text-brand-600">{t('landing.pricing.growthPrice')}</p>
              <p className="mt-2 text-sm text-gray-600">{t('landing.pricing.growthDesc')}</p>
              <ul className="mt-6 space-y-3">
                {['featureEverything', 'featureAnnualBilling', 'featureReporting', 'featureSupport'].map((k) => (
                  <li key={k} className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="h-4 w-4 shrink-0 text-green-600" />
                    {t(`landing.pricing.${k}`)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={openPricingForm}
                className="mt-6 block w-full rounded-lg border border-brand-600 py-2.5 text-center text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors"
              >
                {t('landing.pricing.contactForPricing')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <Link to="/" className="flex items-center gap-2">
              <img src="/mainLogo.png" alt="Clienta AI" className="h-8 w-auto opacity-90" />
            </Link>
            <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
              <a href="https://about.meta.com" target="_blank" rel="noopener noreferrer" className="flex items-center text-gray-400 hover:text-gray-600 transition-colors">
                <img src="/meta-lockup.png" alt="Meta" className="h-5 w-auto object-contain opacity-90" />
              </a>
              <a href="https://aws.amazon.com" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 transition-colors">
                <img src="https://d0.awsstatic.com/logos/powered-by-aws.png" alt="Powered by AWS" className="h-4 w-auto opacity-80" />
              </a>
            </div>
          </div>
          <p className="mt-6 text-center sm:text-left text-sm text-gray-500">
            © {new Date().getFullYear()} Clienta AI. {t('landing.footer.rights')}
          </p>
        </div>
      </footer>
    </div>
  );
}
