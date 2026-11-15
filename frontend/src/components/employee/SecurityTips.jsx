import { Lightbulb } from 'lucide-react';
import { useEffect, useState } from 'react';
import { shuffleSecurityTips } from '../../data/security-tips.js';
import { typewriterStep } from './typewriter.js';

const STATIC_ROTATION_MS = 10000;

function nextRotation(current) {
  const queue = current.remainingTips.length
    ? current.remainingTips
    : shuffleSecurityTips(Math.random, current.activeTip.id);
  return { activeTip: queue[0], remainingTips: queue.slice(1) };
}

function createInitialState() {
  const shuffled = shuffleSecurityTips();
  return { activeTip: shuffled[0], remainingTips: shuffled.slice(1), phase: 'typing', length: 0 };
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setReducedMotion(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return reducedMotion;
}

function usePageVisible() {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );
  useEffect(() => {
    const handleVisibilityChange = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  return visible;
}

export function SecurityTips() {
  const [state, setState] = useState(createInitialState);
  const isPageVisible = usePageVisible();
  const reducedMotion = useReducedMotion();
  const { activeTip, phase, length } = state;

  useEffect(() => {
    if (!isPageVisible) return undefined;
    // Reduced motion: whole tips rotate without per-character animation.
    if (reducedMotion) {
      const timer = window.setTimeout(
        () => setState((current) => ({ ...current, ...nextRotation(current) })),
        STATIC_ROTATION_MS,
      );
      return () => window.clearTimeout(timer);
    }
    const { delay, next, advance } = typewriterStep({ phase, length }, activeTip.text);
    const timer = window.setTimeout(
      () => setState((current) => ({ ...current, ...(advance ? nextRotation(current) : {}), ...next })),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [activeTip, phase, length, isPageVisible, reducedMotion]);

  const visibleText = reducedMotion ? activeTip.text : activeTip.text.slice(0, length);
  const idle = (phase === 'typing' && length >= activeTip.text.length) || (phase === 'erasing' && length === 0);

  return (
    <section className="security-tip mt-4 max-w-xl" aria-labelledby="security-tip-label">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-cyan-200"
          aria-hidden="true"
        >
          <Lightbulb className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="security-tip-label" className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">
            Security tip
          </p>
          <p
            className="security-tip-text mt-1 grid min-h-[5.25rem] text-base font-medium leading-7 text-slate-100 sm:min-h-14 sm:text-lg"
            data-tip-id={activeTip.id}
            data-tip-category={activeTip.category}
            data-typewriter={reducedMotion ? 'static' : phase}
          >
            {/* The invisible full sentence reserves the final height so typing never shifts the layout. */}
            <span className="invisible col-start-1 row-start-1" aria-hidden="true">
              {activeTip.text}
            </span>
            <span className="col-start-1 row-start-1" aria-hidden="true">
              {visibleText}
              {!reducedMotion && <span className={`typewriter-cursor${idle ? ' typewriter-cursor-idle' : ''}`} />}
            </span>
            <span className="sr-only">{activeTip.text}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
