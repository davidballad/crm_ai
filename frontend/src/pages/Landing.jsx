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
  Globe,
  Layers,
  Sparkles,
  Share2,
  Megaphone,
  Target,
  Zap,
  Home,
} from 'lucide-react';
import { submitContact } from '../api/contact';
import { useLandingReveal } from '../hooks/useLandingScroll';
import LandingFeatureShowcase from '../components/LandingFeatureShowcase';

const FEATURE_ICONS = [Package, MessageSquare, BarChart3, Users, ShoppingCart];

const SUBJECT_COLLABORATION = 'Collaboration';
const SUBJECT_PRICING = 'Pricing inquiry';
const SUBJECT_CUSTOM_DEV = 'Web & app development';
const BUSINESS_WHATSAPP_URL = 'https://wa.me/593997848591';

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
    <div className="relative mx-auto w-[280px] h-[560px] lg:w-[300px] lg:h-[600px]">
      <div className="relative h-full w-full rounded-[2.35rem] border-[8px] border-white/20 bg-[#0b141a] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.8),0_0_50px_-5px_rgba(59,130,246,0.3)] ring-1 ring-white/10">
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

function LandingCampaigns({ t }) {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = [
    { title: t('landing.campaigns.tab1'), icon: Zap, fullTitle: t('landing.campaigns.tab1Title'), desc: t('landing.campaigns.tab1Desc') },
    { title: t('landing.campaigns.tab2'), icon: Target, fullTitle: t('landing.campaigns.tab2Title'), desc: t('landing.campaigns.tab2Desc') },
    { title: t('landing.campaigns.tab3'), icon: Megaphone, fullTitle: t('landing.campaigns.tab3Title'), desc: t('landing.campaigns.tab3Desc') },
  ];

  return (
    <section className="relative overflow-hidden bg-[#020617] py-24 md:py-32 lg:py-40 dot-pattern vignette-glow">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="landing-reveal text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-400/90 sm:text-sm">{t('landing.campaigns.eyebrow')}</p>
          <h2 className="landing-reveal mt-4 sm:mt-6 font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]">
            {t('landing.campaigns.title')}
          </h2>
          <p className="landing-reveal mx-auto mt-6 sm:mt-8 max-w-2xl text-base sm:text-lg lg:text-xl text-slate-300 leading-relaxed">
            {t('landing.campaigns.subtitle')}
          </p>
        </div>

        <div className="landing-reveal mt-12 sm:mt-16 flex flex-col items-center">
          {/* Pill Tabs */}
          <div className="flex flex-wrap justify-center gap-2 rounded-full border border-white/5 bg-white/[0.03] p-1.5 backdrop-blur-xl sm:gap-3 md:gap-4">
            {tabs.map((tab, i) => (
              <button
                key={i}
                onClick={() => setActiveTab(i)}
                className={`flex items-center gap-2 rounded-full px-4 sm:px-6 py-2 sm:py-2.5 text-xs sm:text-sm font-medium transition-all duration-300 ${activeTab === i
                  ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/25 scale-100'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white hover:scale-105'
                  }`}
              >
                <tab.icon className={`h-4 w-4 transition-colors duration-300 ${activeTab === i ? 'text-white' : 'text-brand-400'}`} />
                {tab.title}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="mt-10 sm:mt-14 w-full max-w-4xl">
            <div className="glass-card overflow-hidden p-6 sm:p-8 md:p-12 transition-all duration-500">
              <div className="grid gap-8 sm:gap-12 lg:grid-cols-2 lg:items-center">
                <div className="space-y-4 sm:space-y-6">
                  <h3 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-white leading-[1.1]">{tabs[activeTab].fullTitle}</h3>
                  <p className="text-base sm:text-lg leading-relaxed text-slate-300">{tabs[activeTab].desc}</p>
                </div>
                <div className="relative">
                  <div className="w-full rounded-2xl border border-white/10 bg-slate-900/60 p-5 ring-1 ring-white/5">
                    {/* Campaign broadcast preview */}
                    <div className="mb-4 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{t('landing.campaigns.previewLabel')}</span>
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-400">{t('landing.campaigns.previewSending')}</span>
                    </div>
                    <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 leading-relaxed">
                      {t('landing.campaigns.previewMessage', { tab: tabs[activeTab].title })}
                    </div>
                    <div className="space-y-2">
                      {[
                        { name: 'María G.', delivered: true },
                        { name: 'Carlos R.', delivered: true },
                        { name: 'Lucía M.', delivered: false },
                        { name: 'Andrés T.', delivered: false },
                      ].map((r) => (
                        <div key={r.name} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600/40 text-[11px] font-bold text-brand-300">
                              {r.name[0]}
                            </div>
                            <span className="text-sm text-slate-200">{r.name}</span>
                          </div>
                          <span className={`text-xs font-medium ${r.delivered ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {r.delivered ? t('landing.campaigns.previewDelivered') : t('landing.campaigns.previewSent')}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-right text-xs text-slate-500">{t('landing.campaigns.previewCount')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, loading } = useAuth();
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

  const openServicesContact = () => {
    setContactSubject(SUBJECT_CUSTOM_DEV);
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
    <div className="landing-page min-h-screen bg-white overflow-x-hidden">
      <nav className="fixed top-0 left-0 right-0 z-50 nav-solid transition-all duration-300">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-xl bg-white px-2 py-1.5 shadow-md ring-1 ring-black/5">
              <img
                src="/main.png"
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
              href="https://br.clientaai.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm font-medium text-white/90 transition-colors hover:text-white sm:inline"
            >
              {t('landing.nav.realEstate')}
            </a>
            <a
              href="#pricing"
              className="hidden text-sm font-medium text-white/90 transition-colors hover:text-white sm:inline"
            >
              {t('landing.nav.pricing')}
            </a>
            <a
              href="#contact"
              className="hidden text-sm font-medium text-white/90 transition-colors hover:text-white sm:inline"
            >
              {t('landing.nav.contact')}
            </a>
            <span className="flex gap-1 text-sm text-white/70">
              <button
                type="button"
                onClick={() => i18n.changeLanguage('en')}
                className={`rounded px-2 py-0.5 transition-colors ${i18n.language === 'en'
                  ? 'bg-white/20 font-medium text-white'
                  : 'hover:bg-white/10'
                  }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => i18n.changeLanguage('es')}
                className={`rounded px-2 py-0.5 transition-colors ${i18n.language === 'es'
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

      {/* Hero — full-bleed premium */}
      <section className="relative min-h-[95vh] overflow-hidden">
        {/* Base gradient + mesh */}
        <div className="landing-hero-bg absolute inset-0" aria-hidden />
        <div className="landing-mesh-bg absolute inset-0" aria-hidden />

        {/* Tech grid */}
        <div className="landing-network-grid absolute inset-0 opacity-10" aria-hidden />

        {/* Film grain */}
        <div className="landing-grain pointer-events-none absolute inset-0" aria-hidden />

        {/* Floating orbs */}
        <div className="landing-orb landing-orb-1" aria-hidden />
        <div className="landing-orb landing-orb-2" aria-hidden />

        {/* Floating particles */}
        {[
          { top: '18%', left: '12%', dur: '9s',  delay: '0s'   },
          { top: '42%', left: '72%', dur: '11s', delay: '2s'   },
          { top: '68%', left: '28%', dur: '8s',  delay: '4s'   },
          { top: '28%', left: '52%', dur: '13s', delay: '1.5s' },
          { top: '78%', left: '82%', dur: '10s', delay: '3s'   },
          { top: '55%', left: '8%',  dur: '12s', delay: '5s'   },
        ].map((p, i) => (
          <div
            key={i}
            className="landing-particle"
            style={{
              top: p.top, left: p.left,
              '--particle-dur': p.dur,
              '--particle-delay': p.delay,
            }}
            aria-hidden
          />
        ))}

        <div className="relative z-10 mx-auto grid min-h-[calc(95vh-4rem)] max-w-6xl grid-cols-1 items-center gap-8 px-4 pb-12 pt-20 sm:px-6 lg:grid-cols-2 lg:gap-12 lg:px-8">
          <div className="text-center lg:text-left">
            <div className="landing-reveal inline-flex items-center gap-2 rounded-full border border-brand-500/25 bg-brand-500/10 px-4 py-1.5 backdrop-blur-sm">
              <span className="landing-badge-dot" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-300/90 sm:text-sm">
                {t('landing.hero.badge')}
              </span>
            </div>
            <h1 className="landing-reveal mt-6 sm:mt-8 font-serif text-3xl sm:text-6xl lg:text-7xl font-bold leading-[1.08] tracking-tight text-white">
              {t('landing.hero.title').split(' ').map((word, i) => (
                <span key={i} className={`inline-block transition-all duration-700 ${i === 1 ? 'text-brand-400 drop-shadow-[0_0_30px_rgba(96,165,250,0.5)]' : ''}`}>
                  {word}{i < t('landing.hero.title').split(' ').length - 1 ? '\u00A0' : ''}
                </span>
              ))}
            </h1>
            <p className="landing-reveal mx-auto mt-8 sm:mt-10 max-w-2xl text-base sm:text-lg leading-relaxed text-slate-300 lg:mx-0">
              {t('landing.hero.subtitle')}
            </p>
            <div className="landing-reveal mt-12 sm:mt-14 flex flex-col items-center gap-4 lg:items-start">
              {/* Primary CTAs */}
              <div className="flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <Link
                  to="/signup"
                  className="btn-primary px-8 sm:px-12 py-4 sm:py-5 text-base sm:text-lg font-bold transition-transform duration-300 hover:scale-110 active:scale-95"
                >
                  {t('landing.hero.getStarted')}
                </Link>
                <Link
                  to="/login"
                  className="btn-secondary px-8 sm:px-10 py-3 sm:py-4 text-sm sm:text-base font-semibold text-white border-white/20 hover:bg-white/10 transition-all duration-300"
                >
                  {t('landing.hero.logIn')}
                </Link>
              </div>
              {/* Secondary WhatsApp link */}
              <a
                href={BUSINESS_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-white/50 transition-all duration-300 hover:text-white hover:gap-3"
              >
                <WhatsAppGlyph className="h-4 w-4 opacity-80" />
                Chatea con nosotros por WhatsApp
              </a>
              {/* Glassmorphism stat cards */}
              <div className="flex flex-wrap items-center gap-3 landing-reveal">
                <div className="landing-stat-card">
                  <span className="stat-dot" aria-hidden />
                  <strong>3×</strong> {t('landing.hero.statConversions', '+ conversiones')}
                </div>
                <div className="landing-stat-card">
                  <span className="stat-dot" aria-hidden />
                  <strong>100%</strong> {t('landing.hero.statWhatsapp', 'WhatsApp oficial')}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center lg:items-end">
            <div className="relative">
              <div className="pointer-events-none absolute -inset-24 rounded-full bg-brand-600/12 blur-[110px] landing-glow-pulse" aria-hidden />
              <div className="pointer-events-none absolute -inset-10 rounded-full bg-brand-400/8 blur-[60px]" aria-hidden />
              <div className="relative z-10">
                <PhoneMockup t={t} />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={scrollToContent}
            className="col-span-full mx-auto mt-4 flex flex-col items-center gap-2 text-xs font-medium uppercase tracking-widest text-white/30 transition-colors hover:text-white/60 lg:mt-0"
            aria-label="Scroll to content"
          >
            <span className="hidden sm:inline">Scroll</span>
            <span className="flex flex-col items-center gap-0.5" aria-hidden>
              <span className="landing-scroll-chevron" />
              <span className="landing-scroll-chevron" />
            </span>
          </button>
        </div>
      </section>

      <div className="bg-[#020617] border-t border-white/5">
        <LandingFeatureShowcase t={t} featureIcons={FEATURE_ICONS} />
      </div>

      <div id="features">
        <LandingCampaigns t={t} />
      </div>

      {/* Contact */}
      <section id="contact" className="relative scroll-mt-24 border-t border-gray-100 bg-white py-16 md:py-24 dot-pattern-dark">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="landing-reveal text-center space-y-4">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 leading-[1.1]">{t('landing.collaborate.title')}</h2>
            <p className="mx-auto mt-4 sm:mt-6 max-w-2xl text-base sm:text-lg text-gray-600 leading-relaxed">{t('landing.collaborate.subtitle')}</p>
          </div>
          <div className="landing-reveal mx-auto mt-12 sm:mt-16 max-w-lg">
            <a
              href={BUSINESS_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#1fa851]"
            >
              <WhatsAppGlyph className="h-5 w-5" />
              {t('landing.collaborate.whatsappCta')}
            </a>
            {sent ? (
              <p className="text-center font-medium text-green-700">{t('landing.collaborate.formSuccess')}</p>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                {contactSubject === SUBJECT_PRICING && (
                  <p className="text-sm font-medium text-brand-600">{t('landing.collaborate.formSubjectPricing')}</p>
                )}
                {contactSubject === SUBJECT_CUSTOM_DEV && (
                  <p className="text-sm font-medium text-brand-600">{t('landing.collaborate.formSubjectServices')}</p>
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

      {/* Custom development services */}
      <section
        id="services"
        className="relative scroll-mt-24 border-t border-gray-100 bg-slate-50 py-16 md:py-24 lg:py-28 dot-pattern-dark"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="landing-reveal text-center space-y-4 sm:space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-brand-600/80 sm:text-sm">{t('landing.services.eyebrow')}</p>
            <h2 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-[1.1]">
              {t('landing.services.title')}
            </h2>
            <p className="mx-auto mt-6 sm:mt-8 max-w-3xl text-base sm:text-lg lg:text-xl leading-relaxed text-gray-600 font-medium">{t('landing.services.subtitle')}</p>
          </div>

          <div className="landing-reveal mt-10 grid gap-6 lg:grid-cols-2 lg:gap-8">
            <div className="card group relative overflow-hidden p-10 transition-all hover:scale-[1.01]">
              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/25">
                  <Globe className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <h3 className="mt-6 text-xl font-bold text-gray-900">{t('landing.services.webTitle')}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600 sm:text-base">{t('landing.services.webDesc')}</p>
                <ul className="mt-6 space-y-3 text-sm text-gray-700">
                  {['webPoint1', 'webPoint2', 'webPoint3'].map((k) => (
                    <li key={k} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <span>{t(`landing.services.${k}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="card group relative overflow-hidden p-10 transition-all hover:scale-[1.01]">
              <div className="relative">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-white shadow-lg shadow-slate-900/20">
                  <Layers className="h-6 w-6" strokeWidth={1.75} />
                </div>
                <h3 className="mt-6 text-xl font-bold text-gray-900">{t('landing.services.appTitle')}</h3>
                <p className="mt-3 text-sm leading-relaxed text-gray-600 sm:text-base">{t('landing.services.appDesc')}</p>
                <ul className="mt-6 space-y-3 text-sm text-gray-700">
                  {['appPoint1', 'appPoint2', 'appPoint3'].map((k) => (
                    <li key={k} className="flex gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                      <span>{t(`landing.services.${k}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="landing-reveal mt-12 flex flex-col items-center">
            <div className="flex items-center gap-2 text-gray-500">
              <Sparkles className="h-4 w-4 text-brand-500" />
              <p className="text-center text-sm text-gray-500 sm:text-base">{t('landing.services.ctaHint')}</p>
            </div>
            <button
              type="button"
              onClick={openServicesContact}
              className="mt-6 btn-primary px-10 py-4 text-base"
            >
              {t('landing.services.cta')}
            </button>
          </div>
        </div>
      </section>

      {/* Real Estate Referral */}
      <section className="relative overflow-hidden bg-[#020617] py-16 md:py-24 dot-pattern">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="landing-reveal glass-card border-brand-500/30 bg-brand-500/5 p-8 md:p-12 transition-all hover:border-brand-500/50">
            <div className="flex flex-col items-center gap-10 lg:flex-row lg:justify-between">
              <div className="max-w-2xl text-center lg:text-left">
                <span className="inline-block rounded-full bg-brand-500/20 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-400 ring-1 ring-brand-500/30 mb-6">
                  {t('landing.realEstate.badge')}
                </span>
                <h2 className="font-serif text-4xl font-bold tracking-tight text-white sm:text-5xl">
                  {t('landing.realEstate.title')}
                </h2>
                <p className="mt-6 text-lg text-slate-300 leading-relaxed font-medium">
                  {t('landing.realEstate.subtitle')}
                </p>
                <div className="mt-10">
                  <a
                    href="https://br.clientaai.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary inline-flex items-center gap-2 px-10 py-4 text-base font-semibold shadow-[0_0_40px_-5px_rgba(59,130,246,0.3)] transition-transform hover:scale-105 active:scale-95"
                  >
                    <Home className="h-5 w-5" />
                    {t('landing.realEstate.cta')}
                  </a>
                </div>
              </div>
              <div className="relative flex justify-center lg:justify-end">
                <div className="relative h-64 w-64 lg:h-80 lg:w-80">
                  <div className="absolute inset-0 bg-brand-500/20 blur-[60px] animate-pulse pointer-events-none" />
                  <div className="relative flex h-full w-full items-center justify-center rounded-3xl border border-white/10 bg-slate-900/40 backdrop-blur-3xl shadow-2xl ring-1 ring-white/10 group overflow-hidden">
                    <Home className="h-32 w-32 text-brand-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.6)] transition-all duration-500 group-hover:scale-110" strokeWidth={1} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section
        id="trust"
        className="relative border-t border-gray-100 bg-white py-12 md:py-16 dot-pattern-dark"
      >
        <div className="landing-reveal mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6 sm:gap-8">
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

      {/* Pricing */}
      <section className="relative border-t border-gray-100 bg-white py-16 md:py-24 lg:py-28 dot-pattern-dark" id="pricing">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="landing-reveal text-center space-y-4">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-gray-900 leading-[1.1]">{t('landing.pricing.title')}</h2>
            <p className="mx-auto mt-4 sm:mt-6 max-w-2xl text-base sm:text-lg text-gray-600 leading-relaxed">{t('landing.pricing.subtitle')}</p>
          </div>
          <div className="mt-12 sm:mt-16 mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">

            {/* Basic plan */}
            <div className="landing-reveal flex flex-col rounded-2xl border border-gray-200 bg-gradient-to-b from-white via-gray-50/50 to-gray-50 p-8 shadow-sm transition-all duration-300 hover:shadow-md hover:border-gray-300 ring-1 ring-gray-100">
              <div>
                <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-gray-500">{t('landing.pricing.starterBadge')}</span>
                <h3 className="mt-4 text-2xl font-bold text-gray-900">{t('landing.pricing.starterName')}</h3>
                <p className="mt-1 text-sm font-medium text-brand-600">{t('landing.pricing.starterPrice')}</p>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{t('landing.pricing.starterDesc')}</p>
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                {['featureShopLink', 'featureInv', 'featureReporting', 'featureWhatsApp'].map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    {t(`landing.pricing.${k}`)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={openPricingForm}
                className="mt-8 block w-full btn-secondary py-2.5 text-center text-sm font-medium text-brand-600 transition-colors border-brand-200 hover:bg-brand-50"
              >
                {t('landing.pricing.contactInitialSetup')}
              </button>
            </div>

            {/* Pro plan */}
            <div className="landing-reveal relative flex flex-col rounded-2xl border-2 border-brand-400 bg-gradient-to-b from-brand-50/80 via-white to-white p-8 shadow-xl transition-all duration-300 hover:shadow-2xl hover:border-brand-500 ring-1 ring-brand-200 hover:ring-brand-300">
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="rounded-full bg-brand-600 px-4 py-1 text-xs font-bold uppercase tracking-widest text-white shadow-lg shadow-brand-600/30">
                  {t('landing.pricing.proBadge')}
                </span>
              </div>
              <div>
                <h3 className="mt-4 text-2xl font-bold text-gray-900">{t('landing.pricing.growthName')}</h3>
                <p className="mt-1 text-sm font-medium text-brand-600">{t('landing.pricing.growthPrice')}</p>
                <p className="mt-3 text-sm leading-relaxed text-gray-600">{t('landing.pricing.growthDesc')}</p>
              </div>
              <ul className="mt-6 flex-1 space-y-3">
                {['featureEverythingInBasic', 'featureChatbot', 'featureLeads', 'featureAI', 'featureMessaging', 'featureMonthlyOrAnnual', 'featureSupport'].map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                    {t(`landing.pricing.${k}`)}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={openPricingForm}
                className="mt-8 block w-full btn-primary py-2.5 text-center text-sm font-medium"
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
                src="/main.png"
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
          <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
            <p className="text-center text-sm text-gray-500 sm:text-left">
              © {new Date().getFullYear()} Clienta AI. {t('landing.footer.rights')}
              <span className="mx-2 hidden sm:inline">·</span>
              <span className="block sm:inline">{t('landing.footer.address')}</span>
            </p>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <a href="/privacy-policy.html" className="transition-colors hover:text-gray-700">{t('landing.footer.privacy')}</a>
              <a href="/terms-and-conditions.html" className="transition-colors hover:text-gray-700">{t('landing.footer.terms')}</a>
            </div>
          </div>
          <div className="mt-8 border-t border-gray-200/50 pt-8 text-center text-[11px] leading-relaxed text-gray-400">
            <p className="mx-auto max-w-2xl">{t('landing.footer.unsubscribe')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
