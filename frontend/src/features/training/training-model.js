import { displayLabel } from '../../lib/labels.js';
export const topics = [
  'PHISHING',
  'SOCIAL_ENGINEERING',
  'PASSWORD_SECURITY',
  'MFA',
  'MALWARE',
  'SAFE_BROWSING',
  'USB_SECURITY',
  'PHYSICAL_SECURITY',
  'INFORMATION_HANDLING',
  'INCIDENT_REPORTING',
  'OTHER',
];
export const statuses = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
export const label = (value) => displayLabel(value, { titleCase: true }) || 'Unavailable';
export function formatDate(value) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value)) : 'Not yet';
}
export function emptyDraft() {
  return {
    title: '',
    description: '',
    topic: 'PHISHING',
    learningObjectives: [''],
    estimatedMinutes: 6,
    requiresQuiz: true,
    content: {
      version: 1,
      sections: [
        { key: 'introduction', title: 'Introduction', body: '' },
        { key: 'key-takeaways', title: 'Key takeaways', body: '' },
      ],
    },
  };
}
export function fromProgram(program) {
  return {
    title: program.title,
    description: program.description,
    topic: program.topic,
    learningObjectives: [...program.learningObjectives],
    estimatedMinutes: program.estimatedMinutes,
    requiresQuiz: program.requiresQuiz,
    content: { version: 1, sections: program.content.sections.map((section) => ({ ...section })) },
  };
}
export function validateDraft(draft) {
  const text = (value, max) =>
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max &&
    !/[<>]/u.test(value) &&
    !Array.from(value).some((character) => {
      const code = character.codePointAt(0);
      return code === 127 || (code < 32 && ![9, 10, 13].includes(code));
    });
  if (!text(draft.title, 200)) return 'Enter a plain-text title of at most 200 characters.';
  if (!text(draft.description, 2000)) return 'Enter a plain-text description of at most 2,000 characters.';
  if (
    !topics.includes(draft.topic) ||
    !Number.isInteger(Number(draft.estimatedMinutes)) ||
    Number(draft.estimatedMinutes) < 1 ||
    Number(draft.estimatedMinutes) > 60
  )
    return 'Choose a topic and a duration between 1 and 60 minutes.';
  if (
    !Array.isArray(draft.learningObjectives) ||
    draft.learningObjectives.length < 1 ||
    draft.learningObjectives.length > 8 ||
    draft.learningObjectives.some((item) => !text(item, 240))
  )
    return 'Provide 1–8 plain-text learning objectives, each at most 240 characters.';
  const sections = draft.content?.sections;
  if (!Array.isArray(sections) || sections.length < 2 || sections.length > 16) return 'Provide 2–16 learning sections.';
  const keys = new Set();
  for (const section of sections) {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(section.key) || keys.has(section.key))
      return 'Section keys must be unique lowercase slugs starting with a letter.';
    keys.add(section.key);
    if (!text(section.title, 120) || !text(section.body, 6000))
      return 'Each section needs a plain-text title and body within the displayed limits.';
  }
  if (JSON.stringify(draft.content).length > 40000) return 'Course content is too long.';
  return '';
}
export function courseBody(draft) {
  return {
    ...draft,
    estimatedMinutes: Number(draft.estimatedMinutes),
    title: draft.title.trim(),
    description: draft.description.trim(),
    learningObjectives: draft.learningObjectives.map((item) => item.trim()),
    content: {
      version: 1,
      sections: draft.content.sections.map((section) => ({
        key: section.key,
        title: section.title.trim(),
        body: section.body.trim(),
      })),
    },
  };
}
export function listQuery(filters = {}, page = 1, admin = false) {
  const query = { page, pageSize: 20 };
  for (const key of admin ? ['status', 'topic', 'sort', 'search'] : ['status'])
    if (filters[key]) query[key] = filters[key].trim();
  if (query.search && query.search.length > 100) throw new Error('Search must be at most 100 characters.');
  return query;
}
export function bulkAssignmentNotice({ eligible, created, alreadyAssigned, revoked }) {
  if (!eligible) return 'No active employees were eligible for assignment.';
  const parts = [`${created} new ${created === 1 ? 'assignment' : 'assignments'} created`];
  if (alreadyAssigned) parts.push(`${alreadyAssigned} already assigned`);
  if (revoked) parts.push(`${revoked} skipped because an earlier assignment was revoked`);
  return `${parts.join(', ')}.`;
}
export function nextSection(assignment) {
  const sections = assignment.training.content?.sections ?? [];
  const done = assignment.progress?.completedSectionKeys ?? [];
  return sections.findIndex((section) => !done.includes(section.key));
}
export function trainingError(error) {
  if (error?.status === 401) return 'Your session or administrator MFA verification expired. Sign in again.';
  if (error?.status === 403) return 'You are not authorized for this training area.';
  if (error?.status === 404) return 'This course or assignment is unavailable to your account.';
  if (error?.status === 409 && error?.code === 'TRAINING_STALE')
    return 'Another administrator changed this program. Your draft was not saved. Review the latest version before retrying.';
  if (error?.status === 409) return 'This action is no longer available. Refresh to review the latest course state.';
  if (error?.status === 429) return 'Too many requests. Wait a minute and try again.';
  if (error?.status === 400) return 'The request was rejected. Check the entered fields and try again.';
  return 'The training service could not complete the request. Try again.';
}
