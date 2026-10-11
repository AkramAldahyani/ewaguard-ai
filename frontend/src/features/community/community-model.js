export const categories = ['PHISHING', 'SUSPICIOUS_EMAIL', 'SUSPICIOUS_LINK', 'SUSPICIOUS_FILE', 'SECURITY_TIP', 'SECURITY_WARNING', 'EDUCATIONAL_CONTENT'];
export const statuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REMOVED'];
export const label = (value) => value?.toLowerCase().replaceAll('_', ' ').replace(/^\w/u, (letter) => letter.toUpperCase()) ?? 'Unknown';
export const dateTime = (value) => value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC' : '—';
export function moderationError(error) {
  if (error?.status === 401) return 'Your administrator session has expired. Sign in and complete MFA again.';
  if (error?.status === 403) return 'Your current permissions do not allow community moderation.';
  if (error?.code === 'COMMUNITY_ATTACHMENTS_UNREVIEWED') return 'This post cannot be approved because its attachments cannot be securely reviewed.';
  if (error?.status === 409) return 'Another administrator changed this post. Review the latest state before deciding again.';
  if (error?.status === 404) return 'This post is no longer available.';
  return 'Community moderation could not be completed. Please try again.';
}
export function validReason(value) {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= 1000
    && !/[<>]/u.test(value) && !Array.from(value).some((character) => { const code = character.codePointAt(0); return code === 127 || code < 32 && ![9, 10, 13].includes(code); });
}

const plain = (value, max) => typeof value === 'string' && Boolean(value.trim()) && value.length <= max
  && !/[<>]/u.test(value) && !Array.from(value).some((character) => { const code = character.codePointAt(0); return code === 127 || code < 32 && ![9, 10, 13].includes(code); });
export function validateCommunityPost(post, acknowledged) {
  if (!plain(post.title, 200)) return 'Enter a plain-text title of 1–200 characters without HTML.';
  if (!categories.includes(post.category)) return 'Select a community category.';
  if (!plain(post.body, 5000)) return 'Enter a plain-text description of 1–5,000 characters without HTML.';
  if (!acknowledged) return 'Read and acknowledge the sensitive-information notice before continuing.';
  return '';
}
export function communityError(error, context = 'load') {
  if (error?.status === 401) return 'Your session has expired. Sign in again to access the community.';
  if (error?.code === 'COMMUNITY_ACKNOWLEDGEMENT_REQUIRED') return 'Your acknowledgement expired. Review the notice and submit again.';
  if (error?.status === 403) return 'Your current permissions do not allow this community action.';
  if (error?.status === 404) return 'This post is unavailable or you do not have access to it.';
  if (error?.status === 429) return 'Too many community requests. Wait a moment and try again.';
  if (error?.status === 400) return 'Check the title, category, and description, then try again.';
  return context === 'submit' ? 'The post could not be submitted. Please try again.' : 'Community posts could not be loaded. Please try again.';
}
