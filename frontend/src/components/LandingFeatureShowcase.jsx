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
      className="border-t border-gray-100 py-10 md:py-14"
      aria-labelledby="offers-heading"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="landing-reveal text-center">
          <h2
            id="offers-heading"
            className="font-landing-serif text-4xl font-semibold tracking-tight text-gray-900 md:text-5xl lg:text-[2.75rem] lg:leading-tight"
          >
            {t('landing.offers.title')}
          </h2>
          <p className="mx-auto mt-5 max-w-3xl text-lg leading-relaxed text-gray-600 md:text-xl">
            {t('landing.offers.subtitle')}
          </p>
        </div>

        <div className="landing-reveal relative mt-8 md:mt-10">
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-0 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-md transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 md:flex lg:left-2 lg:h-14 lg:w-14"
            aria-label={t('landing.carousel.prev')}
          >
            <ChevronLeft className="h-7 w-7" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-0 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-md transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 md:flex lg:right-2 lg:h-14 lg:w-14"
            aria-label={t('landing.carousel.next')}
          >
            <ChevronRight className="h-7 w-7" strokeWidth={1.75} />
          </button>

          <div className="card md:mx-14 lg:mx-20">
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
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200/70 text-brand-700 shadow-inner md:h-16 md:w-16 lg:h-18 lg:w-18">
                      <Ic className="h-7 w-7 md:h-8 md:w-8 lg:h-9 lg:w-9" strokeWidth={1.5} />
                    </div>
                    <h3 className="mt-5 font-landing-serif text-xl font-semibold leading-snug text-gray-900 sm:text-2xl md:mt-6 md:text-3xl lg:text-[1.85rem]">
                      {t(`landing.offers.feature${i}Title`)}
                    </h3>
                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-gray-600 sm:text-base md:mt-5 md:text-lg md:leading-relaxed lg:text-base lg:leading-relaxed">
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
                    ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm ring-2 ring-brand-200'
                    : 'border-gray-200 bg-white text-gray-400 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-600'
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
                  i === index ? 'w-8 bg-brand-600' : 'w-2 bg-gray-300 hover:bg-gray-400'
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
