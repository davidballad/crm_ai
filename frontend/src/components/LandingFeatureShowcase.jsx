import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const FEATURE_COUNT = 5;
const SLIDE_PCT = 100 / FEATURE_COUNT;
const AUTOPLAY_MS = 7000;

/**
 * “Everything you need” — large carousel with slide track, arrows, dots, touch swipe, autoplay in view.
 */
export default function LandingFeatureShowcase({ t, featureIcons: FeatureIcons }) {
  const sectionRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [motionOk, setMotionOk] = useState(true);
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setMotionOk(!mq.matches);
    const fn = () => setMotionOk(!mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setInView(e.isIntersecting && e.intersectionRatio >= 0.06);
      },
      { threshold: [0, 0.06, 0.12], rootMargin: '0px 0px -6% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const go = useCallback((dir) => {
    setIndex((i) => (i + dir + FEATURE_COUNT) % FEATURE_COUNT);
  }, []);

  useEffect(() => {
    if (!inView || !motionOk) return;
    const id = setInterval(() => go(1), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [inView, motionOk, go]);

  const onTouchStart = (e) => {
    touchStartX.current = e.changedTouches[0].screenX;
  };

  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].screenX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 48) return;
    if (dx < 0) go(1);
    else go(-1);
  };

  const transitionClass = motionOk ? 'transition-transform duration-500 ease-out' : '';

  return (
    <section
      ref={sectionRef}
      className="border-t border-white/5 py-10 md:py-14"
      aria-labelledby="offers-heading"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="landing-reveal text-center">
          <h2
            id="offers-heading"
            className="font-landing-serif text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-[2.75rem] lg:leading-tight"
          >
            {t('landing.offers.title')}
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-slate-400 md:text-xl">
            {t('landing.offers.subtitle')}
          </p>
        </div>

        <div className="landing-reveal relative mt-8 md:mt-10">
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-0 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 backdrop-blur-sm transition-colors hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-400 md:flex lg:left-2 lg:h-14 lg:w-14"
            aria-label={t('landing.carousel.prev')}
          >
            <ChevronLeft className="h-7 w-7" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-0 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 backdrop-blur-sm transition-colors hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-400 md:flex lg:right-2 lg:h-14 lg:w-14"
            aria-label={t('landing.carousel.next')}
          >
            <ChevronRight className="h-7 w-7" strokeWidth={1.75} />
          </button>

          <div className="glass-feature-card overflow-hidden md:mx-14 lg:mx-20">
            <div
              className={`flex ${transitionClass}`}
              style={{
                width: `${FEATURE_COUNT * 100}%`,
                transform: `translate3d(-${index * SLIDE_PCT}%, 0, 0)`,
              }}
            >
              {FeatureIcons.map((Ic, i) => (
                <article
                  key={i}
                  className="shrink-0 px-5 py-8 sm:px-8 sm:py-10 md:px-12 md:py-12 lg:px-16 lg:py-14"
                  style={{ width: `${SLIDE_PCT}%` }}
                  aria-hidden={i !== index}
                >
                  <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center md:min-h-[200px] lg:min-h-[230px]">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/15 border border-brand-500/20 text-brand-400 md:h-16 md:w-16 lg:h-18 lg:w-18">
                      <Ic className="h-7 w-7 md:h-8 md:w-8 lg:h-9 lg:w-9" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-5 font-landing-serif text-xl font-semibold leading-snug text-white sm:text-2xl md:mt-6 md:text-3xl lg:text-[1.85rem]">
                      {t(`landing.offers.feature${i}Title`)}
                    </h3>
                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base md:mt-5 md:text-lg md:leading-relaxed lg:text-base lg:leading-relaxed">
                      {t(`landing.offers.feature${i}Desc`)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2 md:mt-12">
            {FeatureIcons.map((Ic, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-all sm:h-12 sm:w-12 ${
                  i === index
                    ? 'border-brand-500/50 bg-brand-500/15 text-brand-400 shadow-sm ring-2 ring-brand-500/20'
                    : 'border-white/10 bg-white/5 text-white/30 hover:border-white/20 hover:bg-white/10 hover:text-white/60'
                }`}
                aria-label={t(`landing.offers.feature${i}Title`)}
                aria-current={i === index ? 'true' : undefined}
              >
                <Ic className="h-5 w-5" />
              </button>
            ))}
          </div>

          <div className="mt-6 flex justify-center gap-2 md:hidden" role="tablist" aria-label={t('landing.carousel.slideList')}>
            {FeatureIcons.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? 'w-8 bg-brand-600' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
                aria-label={t('landing.carousel.goToSlide', { n: i + 1 })}
              />
            ))}
          </div>
        </div>

        <div className="landing-reveal mt-10 text-center md:mt-12">
          <Link
            to="/signup"
            className="btn-primary px-12 py-4 text-lg"
          >
            {t('landing.hero.getStarted')}
          </Link>
        </div>
      </div>
    </section>
  );
}
