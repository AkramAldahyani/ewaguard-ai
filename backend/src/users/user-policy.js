import zxcvbn from 'zxcvbn';

export class UserManagementError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const fail = (status, code, message) => {
  throw new UserManagementError(status, code, message);
};
const invalid = (message) => fail(400, 'USER_INVALID', message);
export const roles = ['EMPLOYEE', 'IT_SECURITY_ADMIN'];
export const statuses = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'];
export function fields(input, allowed) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowed.includes(key))
  )
    invalid('Unexpected or missing request fields.');
}
export function userId(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    invalid('A valid user or department ID is required.');
  return value;
}
function text(value, max, label) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    invalid(`Enter a valid ${label}.`);
  return value.trim();
}
export function expectedVersion(body) {
  if (
    typeof body.expectedUpdatedAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body.expectedUpdatedAt) ||
    !Number.isFinite(Date.parse(body.expectedUpdatedAt))
  )
    invalid('Reload the account before making changes.');
  return body.expectedUpdatedAt;
}
export function profileInput(body, create = false) {
  fields(body, [
    'firstName',
    'lastName',
    'email',
    'employeeIdentifier',
    'departmentId',
    ...(create ? ['role', 'status'] : ['expectedUpdatedAt']),
  ]);
  const data = {};
  for (const key of ['firstName', 'lastName'])
    if (create || Object.hasOwn(body, key))
      data[key] = text(body[key], 100, key === 'firstName' ? 'first name' : 'last name');
  if (create || Object.hasOwn(body, 'email')) {
    data.email = text(body.email, 254, 'work email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) invalid('Enter a valid work email.');
  }
  if (Object.hasOwn(body, 'employeeIdentifier')) {
    data.employeeIdentifier =
      body.employeeIdentifier === null || body.employeeIdentifier === ''
        ? null
        : text(body.employeeIdentifier, 80, 'employee ID').toUpperCase();
    if (data.employeeIdentifier && !/^[A-Z0-9][A-Z0-9._-]*$/.test(data.employeeIdentifier))
      invalid('Employee IDs may contain letters, numbers, dots, hyphens, and underscores.');
  }
  if (create || Object.hasOwn(body, 'departmentId')) data.departmentId = userId(body.departmentId);
  if (create) {
    if (body.role !== undefined && body.role !== 'EMPLOYEE')
      fail(
        403,
        'USER_ROLE_PROTECTED',
        'New accounts are created as employees. Use the separate role change operation after account setup.',
      );
    if (body.status !== undefined && !['INVITED', 'ACTIVE', 'DEACTIVATED'].includes(body.status))
      invalid('Choose an invited, active, or deactivated initial account.');
    // Active access requires the employee to complete password setup first.
    data.status = body.status === 'DEACTIVATED' ? 'DEACTIVATED' : 'INVITED';
  } else {
    expectedVersion(body);
    if (!Object.keys(data).length) invalid('Provide at least one account field to update.');
  }
  return data;
}
export function listInput(query) {
  fields(query, ['search', 'departmentId', 'role', 'status', 'sort', 'direction', 'page', 'pageSize']);
  for (const value of Object.values(query)) if (typeof value !== 'string') invalid('Each filter must have one value.');
  const number = (key, fallback, max) => {
    if (query[key] === undefined) return fallback;
    if (!/^[1-9]\d*$/.test(query[key]) || Number(query[key]) > max) invalid(`Invalid ${key}.`);
    return Number(query[key]);
  };
  const page = number('page', 1, 100000),
    pageSize = number('pageSize', 20, 100);
  const where = { deletedAt: null };
  if (query.role) {
    if (!roles.includes(query.role)) invalid('Invalid role filter.');
    where.role = { name: query.role };
  }
  if (query.status) {
    if (![...statuses, 'DELETED'].includes(query.status)) invalid('Invalid account status filter.');
    if (query.status === 'DELETED') where.deletedAt = { not: null };
    else where.status = query.status;
  }
  if (query.departmentId) where.departmentId = userId(query.departmentId);
  if (query.search?.trim()) {
    const search = text(query.search, 120, 'search');
    const contains = (value) => ({ contains: value, mode: 'insensitive' });
    where.OR = ['firstName', 'lastName', 'email', 'employeeIdentifier'].map((key) => ({ [key]: contains(search) }));
    // Match names split over the existing firstName/lastName fields in either order.
    const terms = search.split(/\s+/);
    if (terms.length > 1)
      where.OR.push({
        AND: terms.map((term) => ({ OR: [{ firstName: contains(term) }, { lastName: contains(term) }] })),
      });
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search))
      where.OR.push({ id: search });
  }
  const sort = query.sort ?? 'name',
    direction = query.direction ?? 'asc';
  if (!['name', 'createdAt', 'lastLoginAt'].includes(sort) || !['asc', 'desc'].includes(direction))
    invalid('Invalid sort order.');
  const orderBy =
    sort === 'name'
      ? [{ lastName: direction }, { firstName: direction }]
      : [{ [sort]: sort === 'lastLoginAt' ? { sort: direction, nulls: 'last' } : direction }];
  return { where, orderBy: [...orderBy, { id: 'asc' }], page, pageSize, skip: (page - 1) * pageSize };
}
export function setupTokenInput(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token))
    fail(400, 'SETUP_INVALID', 'This setup token is invalid or expired. Request a new one from your administrator.');
  return token;
}
export function setupInput(body) {
  fields(body, ['token', 'password', 'confirmPassword']);
  setupTokenInput(body.token);
  passwordInput(body);
  return body;
}
// One password policy for every onboarding path: length bounds for bcrypt, then local zxcvbn strength.
export function passwordInput(body) {
  if (
    typeof body.password !== 'string' ||
    body.password.length < 12 ||
    Buffer.byteLength(body.password, 'utf8') > 72 ||
    !body.password.trim()
  )
    invalid('Use a password of at least 12 characters and at most 72 UTF-8 bytes.');
  if (Object.hasOwn(body, 'confirmPassword') && body.confirmPassword !== body.password)
    fail(400, 'SETUP_PASSWORD_MISMATCH', 'The passwords do not match.');
  if (zxcvbn(body.password).score < 3)
    fail(
      400,
      'SETUP_PASSWORD_WEAK',
      'Choose a less predictable password. Try a longer, unique passphrase with unrelated words.',
    );
  return body;
}
