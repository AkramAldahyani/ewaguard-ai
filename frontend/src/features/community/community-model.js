import { displayLabel } from '../../lib/labels.js';
export const categories = [
  'PHISHING',
  'SUSPICIOUS_EMAIL',
  'SUSPICIOUS_LINK',
  'SUSPICIOUS_FILE',
  'SECURITY_TIP',
  'SECURITY_WARNING',
  'EDUCATIONAL_CONTENT',
];
export const statuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REMOVED'];
export const label = (value) => displayLabel(value) || 'Unknown';
export const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(
        new Date(value),
      ) + ' UTC'
    : '—';
export function moderationError(error) {
  if (error?.status === 401) return 'Your administrator session has expired. Sign in and complete MFA again.';
  if (error?.status === 403) return 'Your current permissions do not allow community moderation.';
  if (error?.code === 'COMMUNITY_ATTACHMENTS_UNREVIEWED')
    return 'This post cannot be approved because its attachments cannot be securely reviewed.';
  if (error?.status === 409)
    return 'Another administrator changed this post. Review the latest state before deciding again.';
  if (error?.status === 404) return 'This post is no longer available.';
  return 'Community moderation could not be completed. Please try again.';
}
export function validReason(value) {
  return (
    typeof value === 'string' &&
    Boolean(value.trim()) &&
    value.length <= 1000 &&
    !/[<>]/u.test(value) &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    })
  );
}

const plain = (value, max) =>
  typeof value === 'string' &&
  Boolean(value.trim()) &&
  value.length <= max &&
  !/[<>]/u.test(value) &&
  !Array.from(value).some((character) => {
    const code = character.codePointAt(0);
    return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
  });
export function validateCommunityPost(post, acknowledged, hasImages = false) {
  if (post.title !== '' && !plain(post.title, 200))
    return 'Use a plain-text title of up to 200 characters without HTML, or leave it blank.';
  if (!categories.includes(post.category)) return 'Select a community category.';
  if (!(hasImages && post.body === '') && !plain(post.body, 5000))
    return 'Enter a plain-text description of 1–5,000 characters without HTML.';
  if (!acknowledged) return 'Read and acknowledge the sensitive-information notice before continuing.';
  return '';
}
export function communityError(error, context = 'load') {
  if (error?.code === 'COMMUNITY_MEDIA_QUOTA')
    return 'Photo storage is full. Contact IT/security or submit without photos.';
  if (error?.code === 'COMMUNITY_IMAGE_SCANNERS_UNAVAILABLE')
    return 'Required image security checks could not complete. Try again later or submit without photos.';
  if (error?.code === 'COMMUNITY_IMAGE_DETECTED')
    return 'A photo triggered a security check and cannot be uploaded. Contact IT/security through the approved reporting process.';
  if (error?.code === 'COMMUNITY_IMAGE_INVALID')
    return 'Check the photo count, size, and format. Only valid, non-animated JPG, PNG, and WebP images are supported.';
  if (error?.status === 401) return 'Your session has expired. Sign in again to access the community.';
  if (error?.code === 'COMMUNITY_ACKNOWLEDGEMENT_REQUIRED')
    return 'Your acknowledgement expired. Review the notice and submit again.';
  if (error?.status === 403) return 'Your current permissions do not allow this community action.';
  if (error?.status === 404) return 'This post is unavailable or you do not have access to it.';
  if (error?.status === 429) return 'Too many community requests. Wait a moment and try again.';
  if (error?.status === 400) return 'Check the title, category, and description, then try again.';
  return context === 'submit'
    ? 'The post could not be submitted. Please try again.'
    : 'Community posts could not be loaded. Please try again.';
}
export function commentError(error) {
  if (error.status === 401) return 'Your session expired. Sign in again.';
  if ([403, 404].includes(error.status)) return 'This content is no longer available to you.';
  if (error.status === 409) return 'This content changed. Refresh and review it again.';
  if (error.status === 429) return 'Too many requests. Please try again shortly.';
  if (error.code === 'COMMENT_SENSITIVE')
    return 'Remove credentials, secrets and personal information. Use the approved incident-reporting process for sensitive evidence.';
  if (error.code === 'COMMENT_ABUSE') return 'Keep comments respectful and focused on cybersecurity learning.';
  if (error.status === 400) return 'Use plain text within the character limit, without HTML or sensitive information.';
  return 'The comment request could not complete. Please try again.';
}
export function reportError(error) {
  if (error.status === 401) return 'Your session expired. Sign in again.';
  if (error.status === 403)
    return 'You cannot perform this report action. Another administrator may need to review it.';
  if (error.status === 404) return 'This content is no longer available.';
  if (error.status === 409) return 'This report or content changed. Refresh and review it again.';
  if (error.status === 429) return 'Too many requests. Please try again shortly.';
  if (error.status === 400)
    return 'Use a valid category and plain text within the character limit, without sensitive information.';
  return 'The report request could not complete. Please try again.';
}
