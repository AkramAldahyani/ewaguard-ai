export const STATUSES = ['NEW', 'UNDER_INVESTIGATION', 'CONTAINED', 'RESOLVED', 'FALSE_POSITIVE', 'CLOSED'];
export const OPEN_STATUSES = ['NEW', 'UNDER_INVESTIGATION', 'CONTAINED'];
export const CLOSED_STATUSES = ['RESOLVED', 'FALSE_POSITIVE', 'CLOSED'];
export const TRANSITIONS = Object.freeze({
  NEW: ['UNDER_INVESTIGATION', 'FALSE_POSITIVE'],
  UNDER_INVESTIGATION: ['CONTAINED', 'RESOLVED', 'FALSE_POSITIVE'],
  CONTAINED: ['UNDER_INVESTIGATION', 'RESOLVED'],
  RESOLVED: ['UNDER_INVESTIGATION', 'CLOSED'],
  FALSE_POSITIVE: ['UNDER_INVESTIGATION', 'CLOSED'],
  CLOSED: ['UNDER_INVESTIGATION'],
});
export const NOTE_NOTICE = Object.freeze({
  version: 'incident-note-1.0',
  message:
    'Submit only necessary incident information. Do not include passwords, credentials, secrets, confidential or restricted company information, or prohibited personal information. Use the approved reporting channel for restricted material. Reporter-visible updates are shared with the reporting employee.',
});
export class ManagementError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function invalid() {
  throw new ManagementError(400, 'INVALID_INCIDENT_INPUT', 'Check the incident request fields.');
}
export function uuid(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    invalid();
  return value.toLowerCase();
}
export function fields(value, allowed, required = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    invalid();
}
export function choice(value, allowed) {
  if (!allowed.includes(value)) invalid();
  return value;
}
export function timestamp(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  )
    invalid();
  return new Date(value);
}
export function pagination(query, extra = []) {
  fields(query, ['page', 'pageSize', ...extra]);
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d{0,4}$/.test(value) || Number(value) > max) invalid();
    return Number(value);
  };
  return { page: integer(query.page, 1, 10000), pageSize: integer(query.pageSize, 20, 100) };
}
export function searchInput(value) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 100 ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    invalid();
  return value.trim();
}
export function noteInput(body) {
  fields(
    body,
    ['body', 'visibility', 'noticeVersion', 'acknowledged', 'expectedUpdatedAt'],
    ['body', 'visibility', 'noticeVersion', 'acknowledged', 'expectedUpdatedAt'],
  );
  if (
    typeof body.body !== 'string' ||
    !body.body.trim() ||
    body.body.length > 4000 ||
    [...body.body].some(
      (char) => (char.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(char)) || char.charCodeAt(0) === 127,
    ) ||
    body.noticeVersion !== NOTE_NOTICE.version ||
    body.acknowledged !== true
  )
    invalid();
  return { body: body.body.trim(), visibility: choice(body.visibility, ['SECURITY_TEAM', 'REPORTER']) };
}
