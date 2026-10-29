// Memory only: retain a digest and random key across ambiguous network retries.
// Resetting or completing the flow creates a new logical submission.
export function createSubmissionKey() {
  let previous;
  let key;
  let generation = 0;
  return {
    clear() { generation++; previous = undefined; key = undefined; },
    async forInput(input) {
      const current = generation;
      const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(await input.arrayBuffer());
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) => v.toString(16).padStart(2, '0')).join('');
      const fingerprint = typeof input === 'string' ? digest : `${input.name}:${input.type}:${digest}`;
      if (current !== generation) return crypto.randomUUID();
      if (previous !== fingerprint) { previous = fingerprint; key = crypto.randomUUID(); }
      return key;
    },
  };
}
