import zxcvbn from 'zxcvbn';

// Strength is estimated locally with zxcvbn; the password never leaves the device for scoring.
export const passwordScore = (password) => (password ? zxcvbn(password).score : 0);
