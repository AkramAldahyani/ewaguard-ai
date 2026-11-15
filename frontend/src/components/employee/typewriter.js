export const TYPEWRITER_TIMING = Object.freeze({
  typeMs: 42,
  punctuationPauseMs: 180,
  eraseMs: 20,
  gapMs: 450,
  minHoldMs: 3200,
  maxHoldMs: 7000,
  holdPerWordMs: 330,
});

// Reading time scales with sentence length so short tips do not linger and long tips stay readable.
export function typewriterHoldMs(text, timing = TYPEWRITER_TIMING) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(timing.maxHoldMs, Math.max(timing.minHoldMs, words * timing.holdPerWordMs));
}

// Pure state machine: typing → hold → erasing → gap → next text. Returns the delay before the next step.
export function typewriterStep({ phase, length }, text, timing = TYPEWRITER_TIMING) {
  if (phase === 'typing') {
    if (length < text.length) {
      const pause = /[,;:.]/.test(text[length - 1] ?? '') ? timing.punctuationPauseMs : 0;
      return { delay: timing.typeMs + pause, next: { phase, length: length + 1 } };
    }
    return { delay: typewriterHoldMs(text, timing), next: { phase: 'erasing', length } };
  }
  if (length > 0) return { delay: timing.eraseMs, next: { phase, length: length - 1 } };
  return { delay: timing.gapMs, next: { phase: 'typing', length: 0 }, advance: true };
}
