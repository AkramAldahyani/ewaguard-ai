export class TrainingError extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
export function fail(message = 'Invalid training request.', status = 400, code = 'TRAINING_INVALID') {
  throw new TrainingError(status, code, message);
}
export function fields(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) fail();
}
export function identifier(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) fail('Invalid identifier.');
  return value.toLowerCase();
}
function plain(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>]/u.test(value)
    || Array.from(value).some((character) => { const code = character.codePointAt(0); return code === 127 || (code < 32 && ![9, 10, 13].includes(code)); })) fail('Use bounded plain text without HTML.');
  return value.trim();
}
export const topics = ['PHISHING', 'SOCIAL_ENGINEERING', 'PASSWORD_SECURITY', 'MFA', 'MALWARE', 'SAFE_BROWSING', 'USB_SECURITY', 'PHYSICAL_SECURITY', 'INFORMATION_HANDLING', 'INCIDENT_REPORTING', 'OTHER'];
export function courseInput(body, edit = false) {
  const keys = ['title', 'description', 'topic', 'learningObjectives', 'estimatedMinutes', 'content', 'requiresQuiz'];
  fields(body, edit ? [...keys, 'expectedUpdatedAt'] : keys, keys);
  if (!topics.includes(body.topic) || typeof body.requiresQuiz !== 'boolean' || !Number.isInteger(body.estimatedMinutes) || body.estimatedMinutes < 1 || body.estimatedMinutes > 60) fail();
  if (!Array.isArray(body.learningObjectives) || body.learningObjectives.length < 1 || body.learningObjectives.length > 8) fail();
  fields(body.content, ['version', 'sections'], ['version', 'sections']);
  if (body.content.version !== 1 || !Array.isArray(body.content.sections) || body.content.sections.length < 2 || body.content.sections.length > 16 || JSON.stringify(body.content).length > 40000) fail('Provide 2–16 bounded learning sections.');
  const seen = new Set();
  const sections = body.content.sections.map((section) => {
    fields(section, ['key', 'title', 'body'], ['key', 'title', 'body']);
    if (typeof section.key !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(section.key) || seen.has(section.key)) fail('Section keys must be unique.');
    seen.add(section.key);
    return { key: section.key, title: plain(section.title, 120), body: plain(section.body, 6000) };
  });
  return { title: plain(body.title, 200), description: plain(body.description, 2000), topic: body.topic,
    learningObjectives: body.learningObjectives.map((item) => plain(item, 240)), estimatedMinutes: body.estimatedMinutes,
    requiresQuiz: body.requiresQuiz, content: { version: 1, sections } };
}
export function pageInput(query, extra = []) {
  fields(query, ['page', 'pageSize', ...extra]);
  const number = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) fail();
    return Number(value);
  };
  const page = number(query.page, 1, 1000), pageSize = number(query.pageSize, 20, 50);
  return { page, pageSize, skip: (page - 1) * pageSize };
}
export function searchText(value) { return value === undefined ? undefined : plain(value, 100); }
export function expected(body, record) {
  if (typeof body.expectedUpdatedAt !== 'string' || body.expectedUpdatedAt !== record.updatedAt.toISOString()) fail('This program changed. Reload before saving.', 409, 'TRAINING_STALE');
}
