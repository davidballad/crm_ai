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
  ChevronDown,
} from 'lucide-react';
import { submitContact } from '../api/contact';
import { useHeroParallax, useLandingReveal } from '../hooks/useLandingScroll';
import LandingFeatureShowcase from '../components/LandingFeatureShowcase';

const FEATURE_ICONS = [Package, MessageSquare, BarChart3, Users, ShoppingCart];

const SUBJECT_COLLABORATION = 'Collaboration';
const SUBJECT_PRICING = 'Pricing inquiry';

/** Lightweight WhatsApp glyph from /public only (~2KB SVG). */
function WhatsAppGlyph({ className }) {
  return (
    <img
      src="/whatsapp-glyph.svg"
      alt=""
      width={40}
      height={40}
      className={className}
      decoding="async"
    />
  );
}

function PhoneMockup({ t }) {
  return (
    <div className="relative mx-auto w-full max-w-[280px] lg:max-w-[300px]" aria-hidden>
      <div className="relative aspect-[9/18] rounded-[2.35rem] border-[9px] border-gray-950 bg-gray-950 shadow-[0_25px_60px_-12px_rgba(0,0,0,0.65)] ring-1 ring-white/15">
        <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-black/90" />
        <div className="absolute inset-[7px] flex flex-col overflow-hidden rounded-[1.65rem] bg-[#0b141a]">
          <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-[#1f2c34] px-3 py-2.5">
            <WhatsAppGlyph className="h-8 w-8 shrink-0" />
            <span className="truncate text-xs font-semibold text-white">{t('landing.phoneMock.header')}</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%228%22 height=%228%22%3E%3Crect fill=%22%23ffffff%22 fill-opacity=%22.02%22 width=%228%22 height=%228%22/%3E%3C/svg%3E')] p-3">
            <div className="max-w-[92%] rounded-lg rounded-tl-sm bg-white/10 px-3 py-2 text-[11px] leading-snug text-white/95 shadow-sm">
              {t('landing.phoneMock.msgIn')}
            </div>
            <div className="ml-auto max-w-[92%] rounded-lg rounded-tr-sm bg-[#005c4b] px-3 py-2 text-[11px] leading-snug text-white/95 shadow-sm">
              {t('landing.phoneMock.msgOut')}
            </div>
            <div className="mt-auto flex items-center gap-1 rounded-full bg-white/5 px-2 py-1.5 text-[10px] text-white/40">
              <span className="inline-block h-1 w-1 rounded-full bg-white/30" />
              <span className="flex-1 text-center">···</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, loading } = useAuth();
  const heroParallaxY = useHeroParallax(0.14);
  useLandingReveal();

  const [contactSubject, setContactSubject] = useState(SUBJECT_COLLABORATION);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState(null);

  const scrollToContent = () => {
    document.getElementById('trust')?.scrollIntoView({ behavior: 'smooth' });
  };

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
    <div className="landing-page min-h-screen bg-white font-landing-sans">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-xl bg-white px-2 py-1.5 shadow-md ring-1 ring-black/5">
              <img
                src="/mainLogo.png"
                alt="Clienta AI"
                width={160}
                height={40}
                className="h-8 w-auto sm:h-10"
                decoding="async"
                fetchpriority="high"
              />
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="#pricing"
              className="hidden text-sm font-medium text-white/90 transition-colors hover:text-white sm:inline"
            >
              {t('landing.nav.pricing')}
            </a>
            <span className="flex gap-1 text-sm text-white/70">
              <button
                type="button"
                onClick={() => i18n.changeLanguage('en')}
                className={`rounded px-2 py-0.5 transition-colors ${
                  i18n.language === 'en'
                    ? 'bg-white/20 font-medium text-white'
                    : 'hover:bg-white/10'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => i18n.changeLanguage('es')}
                className={`rounded px-2 py-0.5 transition-colors ${
                  i18n.language === 'es'
                    ? 'bg-white/20 font-medium text-white'
                    : 'hover:bg-white/10'
                }`}
              >
                ES
              </button>
            </span>
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 sm:px-4"
            >
              {t('landing.nav.logIn')}
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-500"
            >
              {t('landing.nav.signUp')}
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — full-bleed premium + parallax (no heavy raster images) */}
      <section className="relative min-h-[92vh] overflow-hidden pt-16">
        <div
          className="landing-hero-bg absolute inset-0 will-change-transform"
          style={{ transform: `translate3d(0, ${heroParallaxY * 0.4}px, 0)` }}
          aria-hidden
        />
        <div
          className="landing-grain pointer-events-none absolute inset-0 will-change-transform"
          style={{ transform: `translate3d(0, ${heroParallaxY * 0.25}px, 0)` }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -left-1/4 top-1/3 h-[min(80vw,520px)] w-[min(80vw,520px)] rounded-full bg-brand-500/15 blur-3xl will-change-transform"
          style={{ transform: `translate3d(0, ${heroParallaxY * 0.5}px, 0)` }}
          aria-hidden
        />

        <div className="relative z-10 mx-auto grid min-h-[calc(92vh-4rem)] max-w-6xl grid-cols-1 items-center gap-12 px-4 pb-24 pt-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
          <div className="text-center lg:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-200/90 sm:text-sm">
              {t('landing.hero.badge')}
            </p>
            <h1 className="mt-6 font-landing-serif text-[2.65rem] font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl lg:leading-[1.05]">
              {t('landing.hero.title')}
            </h1>
            <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg lg:mx-0">
              {t('landing.hero.subtitle')}
            </p>
            <div className="mt-12 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <Link
                to="/signup"
                className="rounded-full bg-brand-500 px-8 py-3.5 text-base font-medium text-white shadow-xl shadow-brand-600/30 transition-all hover:bg-brand-400 hover:shadow-brand-500/40"
              >
                {t('landing.hero.getStarted')}
              </Link>
              <Link
                to="/login"
                className="rounded-full border border-white/25 bg-white/5 px-8 py-3.5 text-base font-medium text-white backdrop-blur-sm transition-colors hover:border-white/40 hover:bg-white/10"
              >
                {t('landing.hero.logIn')}
              </Link>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center lg:items-end">
            <PhoneMockup t={t} />
          </div>

          <button
            type="button"
            onClick={scrollToContent}
            className="col-span-full mx-auto mt-4 flex flex-col items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/50 transition-colors hover:text-white/80 lg:mt-0"
            aria-label="Scroll to content"
          >
            <span className="hidden sm:inline">Scroll</span>
            <ChevronDown className="h-6 w-6 animate-bounce" strokeWidth={1.5} />
          </button>
        </div>
      </section>

      {/* Trust */}
      <section
        id="trust"
        className="border-t border-gray-100 bg-gradient-to-b from-gray-50 to-white py-14 sm:py-16"
      >
        <div className="landing-reveal mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-10 sm:gap-12">
            <div className="flex max-w-xl flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100/90 text-emerald-700 ring-1 ring-emerald-200/60">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">{t('landing.trust.title')}</h2>
              <p className="text-sm text-gray-600">{t('landing.trust.subtitle')}</p>
            </div>
            <a
              href="https://aws.amazon.com/what-is-cloud-computing"
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-90 transition-opacity hover:opacity-100"
              title="Powered by Amazon Web Services"
            >
              <img
                src="https://d0.awsstatic.com/logos/powered-by-aws.png"
                alt="Powered by AWS"
                width={96}
                height={24}
                className="h-7 w-auto"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
              />
            </a>
          </div>
        </div>
      </section>

      <LandingFeatureShowcase t={t} featureIcons={FEATURE_ICONS} />

      {/* Contact */}
      <section id="contact" className="scroll-mt-24 border-t border-gray-100 bg-gray-50/40 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="landing-reveal text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t('landing.collaborate.title')}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-gray-600">{t('landing.collaborate.subtitle')}</p>
          </div>
          <div className="landing-reveal mx-auto mt-10 max-w-lg">
            {sent ? (
              <p className="text-center font-medium text-green-700">{t('landing.collaborate.formSuccess')}</p>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                {contactSubject === SUBJECT_PRICING && (
                  <p className="text-sm font-medium text-brand-600">{t('landing.collaborate.formSubjectPricing')}</p>
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
                  className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
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
      <section className="border-t border-gray-100 bg-white py-20" id="pricing">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="landing-reveal text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">{t('landing.pricing.title')}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-gray-600">{t('landing.pricing.subtitle')}</p>
          </div>
          <div className="mt-14 mx-auto grid max-w-3xl gap-8 sm:grid-cols-2">
            <div className="landing-reveal rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/50 p-8 shadow-sm ring-1 ring-gray-100">
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
                className="mt-6 block w-full rounded-lg border border-brand-600 py-2.5 text-center text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
              >
                {t('landing.pricing.contactForPricing')}
              </button>
            </div>
            <div className="landing-reveal rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50/50 p-8 shadow-sm ring-1 ring-gray-100">
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
                className="mt-6 block w-full rounded-lg border border-brand-600 py-2.5 text-center text-sm font-medium text-brand-600 transition-colors hover:bg-brand-50"
              >
                {t('landing.pricing.contactForPricing')}
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-gray-50/80 py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <Link to="/" className="flex items-center gap-2">
              <img
                src="/mainLogo.png"
                alt="Clienta AI"
                width={128}
                height={32}
                className="h-8 w-auto opacity-90"
                loading="lazy"
                decoding="async"
              />
            </Link>
            <a
              href="https://www.whatsapp.com/business"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-700"
            >
              <WhatsAppGlyph className="h-7 w-7 opacity-90" />
              <span>{t('landing.trust.whatsAppByMeta')}</span>
            </a>
          </div>
          <p className="mt-6 text-center text-sm text-gray-500 sm:text-left">
            © {new Date().getFullYear()} Clienta AI. {t('landing.footer.rights')}
          </p>
        </div>
      </footer>
    </div>
  );
}
