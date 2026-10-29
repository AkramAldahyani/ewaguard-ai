export const accountStatuses = { ACTIVE: 'Active', INVITED: 'Setup pending', SUSPENDED: 'Suspended', DEACTIVATED: 'Inactive', DELETED: 'Removed' };
export const roleName = (role) => role === 'IT_SECURITY_ADMIN' ? 'Administrator' : 'Employee';
export const fullName = (user) => `${user.firstName} ${user.lastName}`.trim();
export const initials = (user) => `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
export const dateLabel = (date) => date ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(date)) : 'Not recorded';
export const defaultFilters = { search: '', departmentId: '', role: '', status: '', sort: 'name', direction: 'asc', page: 1, pageSize: 20 };
export function directoryQuery(filters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== '') query.set(key, String(value));
  return query.toString();
}
export function accountDraft(user) {
  return { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', email: user?.email ?? '',
    employeeIdentifier: user?.employeeIdentifier ?? '', departmentId: user?.department?.id ?? '', status: 'INVITED' };
}
export function validateAccount(draft) {
  const errors = {};
  for (const key of ['firstName', 'lastName']) if (!draft[key].trim() || draft[key].trim().length > 100) errors[key] = 'Enter a name of up to 100 characters.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) || draft.email.trim().length > 254) errors.email = 'Enter a valid work email address.';
  if (draft.employeeIdentifier.trim() && !/^[a-z0-9][a-z0-9._-]{0,79}$/i.test(draft.employeeIdentifier.trim())) errors.employeeIdentifier = 'Use up to 80 letters, numbers, dots, hyphens, or underscores.';
  if (!draft.departmentId) errors.departmentId = 'Select a department.';
  return errors;
}
export function accountBody(draft, user) {
  const body = { firstName: draft.firstName.trim(), lastName: draft.lastName.trim(), email: draft.email.trim(),
    employeeIdentifier: draft.employeeIdentifier.trim() || null, departmentId: draft.departmentId };
  return user ? { ...body, expectedUpdatedAt: user.updatedAt } : { ...body, role: 'EMPLOYEE', status: draft.status };
}
export function userError(error) {
  if (error.code === 'SETUP_DEMO_DISABLED') return 'Manual setup links are disabled on this server. An approved, identity-verified onboarding mechanism is required.';
  if (error.code === 'USER_SETUP_NOT_ALLOWED') return 'Setup links are available only for pending accounts without a password. Refresh the directory to check this account’s status.';
  if (error.code === 'USER_REAUTH_REQUIRED' || error.code === 'USER_ACCESS_DENIED') return 'For account security, sign out and sign in again with MFA, then retry this change. Your changes have not been saved.';
  if (error.status === 401) return 'Your session has expired. Sign in again to continue.';
  if (error.status === 403) return 'You do not have permission to perform this action. Administrator access with verified MFA is required.';
  if (error.code === 'USER_CONFLICT') return 'This account has changed since you opened it. Reload the latest account before trying again.';
  if (error.code === 'USER_LAST_ADMIN') return 'This change would remove the last active administrator. Another administrator must complete MFA enrollment first.';
  if (error.code === 'USER_SELF_PROTECTED') return 'You cannot remove your own administrator access. Ask another authorized administrator to review this account.';
  if (error.status === 429) return 'Too many requests. Wait a moment before trying again.';
  if (error.status === 404) return 'This account is no longer available. Close this panel and refresh the directory.';
  if (error.status >= 500 || !error.status) return 'The service could not complete this request. Please try again. If a save may have completed, refresh the directory before repeating it.';
  return error.message || 'The request could not be completed.';
}
