import { Lightbulb } from 'lucide-react';
import { useEffect, useState } from 'react';
import { shuffleSecurityTips } from '../../data/security-tips.js';

const ROTATION_INTERVAL_MS = 10000;
const TRANSITION_DURATION_MS = 400;

function createInitialRotation() {
  const shuffled = shuffleSecurityTips();
  return { activeTip: shuffled[0], remainingTips: shuffled.slice(1) };
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setReducedMotion(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return reducedMotion;
}

export function SecurityTips() {
  const [{ activeTip }, setRotation] = useState(createInitialRotation);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(() => (
    typeof document === 'undefined' || document.visibilityState !== 'hidden'
  ));
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState !== 'hidden';
      setIsPageVisible(visible);
      if (!visible) setIsTransitioning(false);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!isPageVisible) return undefined;

    let transitionTimer;
    const showNextTip = () => {
      setRotation((current) => {
        let nextTips = current.remainingTips;
        if (nextTips.length === 0) nextTips = shuffleSecurityTips(Math.random, current.activeTip.id);
        return { activeTip: nextTips[0], remainingTips: nextTips.slice(1) };
      });
      setIsTransitioning(false);
    };

    const rotationTimer = window.setTimeout(() => {
      if (reducedMotion) {
        showNextTip();
        return;
      }

      setIsTransitioning(true);
      transitionTimer = window.setTimeout(showNextTip, TRANSITION_DURATION_MS);
    }, ROTATION_INTERVAL_MS);

    return () => {
      window.clearTimeout(rotationTimer);
      window.clearTimeout(transitionTimer);
    };
  }, [activeTip.id, isPageVisible, reducedMotion]);

  return (
    <section className="security-tip mt-4 max-w-xl" aria-labelledby="security-tip-label">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-cyan-200" aria-hidden="true">
          <Lightbulb className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="security-tip-label" className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Security tip</p>
          <p
            className={`security-tip-text mt-1 min-h-[5.25rem] text-base font-medium leading-7 text-slate-100 sm:min-h-14 sm:text-lg ${isTransitioning ? 'security-tip-text-exit' : ''}`}
            data-tip-id={activeTip.id}
            data-tip-category={activeTip.category}
          >
            {activeTip.text}
          </p>
        </div>
      </div>
    </section>
  );
}
