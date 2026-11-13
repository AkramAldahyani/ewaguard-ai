// Human-readable labels for internal enum values (e.g. USB_SECURITY -> "USB security"). One shared helper so
// acronyms and product names are written correctly everywhere instead of "Usb Security" or "Mfa".
const WORDS = Object.freeze({
  AI: 'AI', BEC: 'BEC', CLAMAV: 'ClamAV', DKIM: 'DKIM', DMARC: 'DMARC', DNS: 'DNS', HR: 'HR', ID: 'ID', IP: 'IP', IT: 'IT',
  MFA: 'MFA', OTP: 'OTP', PDF: 'PDF', PDPL: 'PDPL', SMS: 'SMS', SPF: 'SPF', TLS: 'TLS', URL: 'URL', URLS: 'URLs', USB: 'USB',
  VIRUSTOTAL: 'VirusTotal', VPN: 'VPN', WIFI: 'Wi-Fi', YARA: 'YARA',
});
// Whole values whose readable form is not a word-by-word conversion.
const PHRASES = Object.freeze({
  IT_SECURITY_ADMIN: 'IT security administrator', TRUE_FALSE: 'True or false', MULTIPLE_CHOICE: 'Multiple choice',
  NO_KNOWN_DETECTION: 'No known detection', AI_DRAFT: 'AI draft',
});
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to']);

// sentence: "Usb security" style becomes "USB security"; title: "USB Security" for screens that use title case.
export function displayLabel(value, { titleCase = false } = {}) {
  if (typeof value !== 'string' || !value) return '';
  const key = value.trim().toUpperCase();
  if (PHRASES[key]) return titleCase ? PHRASES[key].replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) : PHRASES[key];
  return key.split(/[_\s]+/).filter(Boolean).map((word, index) => {
    if (WORDS[word]) return WORDS[word];
    const lower = word.toLowerCase();
    if (index === 0 || (titleCase && !SMALL.has(lower))) return lower.charAt(0).toUpperCase() + lower.slice(1);
    return lower;
  }).join(' ');
}

// "1 attempt", "2 attempts", "1 person", "3 people".
export function countLabel(count, singular, plural = `${singular}s`) {
  const value = Number(count);
  return `${Number.isFinite(value) ? value.toLocaleString() : count} ${value === 1 ? singular : plural}`;
}

const CONFIDENCE = Object.freeze({ HIGH_CONFIDENCE: 'High', MODERATE_CONFIDENCE: 'Moderate', LIMITED_CONFIDENCE: 'Limited' });
export const confidenceLabel = (value) => CONFIDENCE[value] ?? 'Unavailable';
