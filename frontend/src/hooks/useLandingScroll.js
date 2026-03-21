import { useEffect, useState } from 'react';

/**
 * Landing-only scroll helpers: parallax offset, nav elevation, section reveal.
 * Respects prefers-reduced-motion.
 */

function prefersReducedMotion() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useNavScrollElevated(thresholdPx = 56) {
  const [elevated, setElevated] = useState(false);
  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > thresholdPx);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [thresholdPx]);
  return elevated;
}

export function useHeroParallax(factor = 0.12) {
  const [offsetY, setOffsetY] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setOffsetY(window.scrollY * factor);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [factor]);
  return offsetY;
}

export function useLandingReveal() {
  useEffect(() => {
    const reduced = prefersReducedMotion();

    const connect = () => {
      const nodes = document.querySelectorAll('.landing-reveal');
      if (!nodes.length) return;

      if (reduced) {
        nodes.forEach((n) => n.classList.add('is-visible'));
        return;
      }

      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('is-visible');
              io.unobserve(entry.target);
            }
          });
        },
        {
          // Any pixel visible counts; avoid negative bottom margin so tall sections still reveal
          rootMargin: '0px 0px 12% 0px',
          threshold: 0,
        }
      );
      nodes.forEach((n) => io.observe(n));
      return io;
    };

    // After paint so nested sections (carousel, etc.) have committed .landing-reveal nodes
    let io;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        io = connect();
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      if (io) io.disconnect();
    };
  }, []);
}
