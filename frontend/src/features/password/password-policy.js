import zxcvbn from 'zxcvbn';

export const PASSWORD_POLICY = Object.freeze({
  minLength: 8,
  maxLength: 20,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSymbol: true,
});

export const STRENGTH_LEVELS = Object.freeze([
  { label: 'Very weak', tone: 'danger' },
  { label: 'Weak', tone: 'danger' },
  { label: 'Fair', tone: 'warning' },
  { label: 'Strong', tone: 'success' },
  { label: 'Very strong', tone: 'success' },
]);

export function evaluatePolicy(password, policy = PASSWORD_POLICY) {
  const requirements = [
    { id: 'minLength', label: `At least ${policy.minLength} characters`, met: password.length >= policy.minLength },
    { id: 'maxLength', label: `No more than ${policy.maxLength} characters`, met: password.length <= policy.maxLength },
    ...(policy.requireUppercase
      ? [{ id: 'uppercase', label: 'One uppercase letter', met: /[A-Z]/.test(password) }]
      : []),
    ...(policy.requireLowercase
      ? [{ id: 'lowercase', label: 'One lowercase letter', met: /[a-z]/.test(password) }]
      : []),
    ...(policy.requireNumber ? [{ id: 'number', label: 'One number', met: /[0-9]/.test(password) }] : []),
    ...(policy.requireSymbol ? [{ id: 'symbol', label: 'One symbol', met: /[^A-Za-z0-9\s]/.test(password) }] : []),
  ];
  return {
    compliant: password.length > 0 && requirements.every((item) => item.met),
    requirements,
    failedRequirements: requirements.filter((item) => !item.met).map((item) => item.label),
  };
}

export function analyzePassword(password, policy = PASSWORD_POLICY) {
  if (!password) return null;
  const result = zxcvbn(password);
  const policyResult = evaluatePolicy(password, policy);
  const recommendations = [
    ...new Set([
      ...policyResult.failedRequirements.map((requirement) => `Meet the policy requirement: ${requirement}.`),
      ...(result.feedback.warning ? [result.feedback.warning] : []),
      ...result.feedback.suggestions,
    ]),
  ];
  return {
    score: result.score,
    strength: STRENGTH_LEVELS[result.score],
    guessesLog10: result.guesses_log10,
    resistance: result.crack_times_display.offline_slow_hashing_1e4_per_second,
    policy: policyResult,
    recommendations,
  };
}

export function describeResistance(analysis) {
  if (!analysis) return 'Enter a password to estimate its resistance to guessing.';
  return `Estimated offline resistance with a deliberately slow hash: ${analysis.resistance}. Estimates are approximate and do not guarantee security.`;
}
