import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  Activity,
  AlertCircle,
  Award,
  BookOpenCheck,
  CheckCircle2,
  ExternalLink,
  Info,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Badge, Button, Field, IconButton, Input, Select, StatePanel } from '../../components/ui/index.jsx';
import { useAuth } from '../../context/auth-context.js';
import { useToast } from '../../context/toast.js';
import { AccountBadge, RoleBadge, UserAvatar, DirectorySkeleton } from './UserDirectory.jsx';
import { useUsersResource, saveAccount } from './users-api.js';
import { accountBody, accountDraft, fullName, roleName, dateLabel, userError, validateAccount } from './users-model.js';
import { SetupLinkPanel, SetupLinkReceipt } from './SetupLinkPanel.jsx';

const titles = {
  add: 'Add user',
  view: 'User profile',
  edit: 'Edit user',
  setup: 'Generate New Setup Link',
  activate: 'Activate account',
  suspend: 'Suspend account',
  deactivate: 'Deactivate account',
  delete: 'Remove account',
  role: 'Change account role',
};
const humanize = (value) =>
  value
    ? value
        .toLowerCase()
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : 'Unavailable';
export function OnboardingNotice({ demo = false }) {
  return (
    <div className="users-notice">
      <Info className="size-4 shrink-0" aria-hidden="true" />
      <div>
        <strong>Account setup is pending</strong>
        <p>
          {demo
            ? 'Demo mode: create the account to obtain a single-use setup link. No email will be sent. Verify the participant’s identity before handoff.'
            : 'Manual setup-link sharing is disabled. An approved, identity-verified delivery mechanism is required before organizational onboarding is enabled. No invitation email is sent.'}
        </p>
      </div>
    </div>
  );
}
function RequestError({ error, onReload }) {
  const { logout } = useAuth();
  const [leaving, setLeaving] = useState(false);
  if (!error) return null;
  const reauth = ['USER_REAUTH_REQUIRED', 'USER_ACCESS_DENIED'].includes(error.code);
  return (
    <div className="users-error" role="alert">
      <p>{userError(error)}</p>
      {error.code === 'USER_CONFLICT' && (
        <Button className="mt-3" variant="secondary" onClick={onReload}>
          Reload account
        </Button>
      )}
      {reauth && (
        <Button
          className="mt-3"
          variant="secondary"
          disabled={leaving}
          onClick={async () => {
            setLeaving(true);
            try {
              await logout();
            } catch {
              /* AuthProvider clears the session even when logout fails. */
            }
          }}
        >
          Sign out to verify again
        </Button>
      )}
    </div>
  );
}
function PanelFrame({ title, compact, wide, busy, onClose, children }) {
  const ref = useRef(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current,
      opener = document.activeElement,
      overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus();
      else document.getElementById('users-directory-heading')?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`users-panel ${compact ? 'users-confirm-panel' : ''} ${wide ? 'users-profile-panel' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="users-panel-shell">
        <header className="users-panel-header">
          <div>
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-brand-700">User management</p>
            <h2 id={titleId} className="mt-1 text-xl font-bold text-navy-900">
              {title}
            </h2>
          </div>
          <IconButton label="Close account panel" disabled={busy} onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </header>
        <div className="users-panel-content" aria-busy={busy}>
          {children}
        </div>
      </div>
    </dialog>
  );
}
function AccountHeading({ user }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
      <UserAvatar user={user} />
      <div className="min-w-0">
        <h3 className="break-words font-bold text-slate-900">{fullName(user)}</h3>
        <p className="mt-1 break-all text-sm text-slate-500">{user.email}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <AccountBadge user={user} />
          <RoleBadge role={user.role.name} />
        </div>
      </div>
    </div>
  );
}
function ProfileMetric({ icon: Icon, label, value, hint }) {
  return (
    <div className="users-profile-metric">
      <span className="users-profile-metric-icon">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-1 text-xl font-bold text-navy-900">{value}</p>
        {hint && <p className="mt-1 text-[0.7rem] text-slate-500">{hint}</p>}
      </div>
    </div>
  );
}
function ProfileSection({ title, description, children }) {
  return (
    <section className="users-profile-section">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-navy-900">{title}</h3>
        {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}
function Distribution({ title, items, tones = {} }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-slate-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item.value} tone={tones[item.value] ?? 'neutral'}>
            {humanize(item.value)} · {item.count}
          </Badge>
        ))}
      </div>
    </div>
  );
}
function AccountDetails({ user, profile, onAction, onClose, demo }) {
  const security = profile?.security ?? {
    analyses: { total: 0, email: 0, url: 0, file: 0 },
    incidents: { total: 0, bySeverity: [], byStatus: [], recent: [] },
  };
  const awareness = profile?.awareness ?? {
    training: { assigned: 0, completed: 0, completionPercent: 0, recent: [] },
    monthlyQuizzes: { assigned: 0, participated: 0, participationPercent: 0 },
    certificates: { earned: 0, recent: [] },
  };
  const accountSecurity = profile?.accountSecurity ?? {
    credentialStatus: 'UNAVAILABLE',
    mfaStatus: 'UNAVAILABLE',
    setupState: 'UNAVAILABLE',
    setupExpiresAt: null,
    events: [],
  };
  const activeIncidents = security.incidents.byStatus
    .filter((item) => ['NEW', 'UNDER_INVESTIGATION', 'CONTAINED'].includes(item.value))
    .reduce((sum, item) => sum + item.count, 0);
  const elevatedIncidents = security.incidents.bySeverity
    .filter((item) => ['HIGH', 'CRITICAL'].includes(item.value))
    .reduce((sum, item) => sum + item.count, 0);
  const fields = [
    ['Full name', fullName(user)],
    ['Employee ID', user.employeeIdentifier ?? 'Not assigned'],
    ['Email', user.email],
    ['Department', user.department?.name ?? 'Not assigned'],
    ['Role', roleName(user.role.name)],
    ['Account status', user.deletedAt ? 'Removed' : humanize(user.status)],
    ['Account created', dateLabel(user.createdAt)],
    ['Last login', dateLabel(user.lastLoginAt)],
    ['Internal user ID', user.id],
  ];
  return (
    <div className="users-panel-form">
      <div className="users-panel-body users-profile-body">
        <AccountHeading user={user} />
        {user.status === 'INVITED' && !user.deletedAt && <OnboardingNotice demo={demo} />}
        {user.deletedAt && (
          <div className="users-notice">
            <Info className="size-4 shrink-0" />
            <p>
              This account was removed on {dateLabel(user.deletedAt)}. Access is disabled and historical records are
              retained. Restoring removed accounts is not supported.
            </p>
          </div>
        )}
        <ProfileSection title="Account information" description="Current directory identity and access state.">
          <dl className="users-profile-facts">
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={label === 'Internal user ID' ? 'font-mono text-xs' : ''}>{value}</dd>
              </div>
            ))}
          </dl>
        </ProfileSection>
        <ProfileSection
          title="Account security"
          description="Administrative status only. Credentials, tokens, and MFA secrets are never displayed."
        >
          <div className="users-profile-metrics">
            <ProfileMetric icon={KeyRound} label="Credentials" value={humanize(accountSecurity.credentialStatus)} />
            <ProfileMetric icon={ShieldCheck} label="Administrator MFA" value={humanize(accountSecurity.mfaStatus)} />
            <ProfileMetric
              icon={Activity}
              label="Setup state"
              value={humanize(accountSecurity.setupState)}
              hint={
                accountSecurity.setupExpiresAt
                  ? `Token expires ${dateLabel(accountSecurity.setupExpiresAt)}`
                  : undefined
              }
            />
          </div>
          <div className="mt-5">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">
              Recent account-security events
            </h4>
            {accountSecurity.events.length ? (
              <ol className="users-profile-timeline">
                {accountSecurity.events.map((event) => (
                  <li key={event.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">{humanize(event.action)}</p>
                      <Badge tone={event.outcome === 'FAILURE' || event.outcome === 'DENIED' ? 'warning' : 'success'}>
                        {humanize(event.outcome)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {dateLabel(event.createdAt)} ·{' '}
                      {event.actorKind === 'USER'
                        ? event.actor
                          ? `${event.actor.firstName} ${event.actor.lastName}`
                          : 'Retained user identity'
                        : humanize(event.actorKind)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="users-profile-empty">No retained account-security events are available.</p>
            )}
          </div>
        </ProfileSection>
        <ProfileSection
          title="Security overview"
          description="Aggregated operational records. Analysis contents and uploaded files are excluded."
        >
          <div className="users-profile-metrics">
            <ProfileMetric
              icon={Activity}
              label="Security analyses"
              value={security.analyses.total}
              hint={`${security.analyses.email} email · ${security.analyses.url} URL · ${security.analyses.file} file`}
            />
            <ProfileMetric icon={ShieldAlert} label="Associated incidents" value={security.incidents.total} />
            <ProfileMetric icon={ShieldAlert} label="Active incidents" value={activeIncidents} />
            <ProfileMetric icon={AlertCircle} label="High / critical" value={elevatedIncidents} />
          </div>
          {security.incidents.total ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <Distribution
                title="Incident severity"
                items={security.incidents.bySeverity}
                tones={{ LOW: 'success', MEDIUM: 'warning', HIGH: 'danger', CRITICAL: 'danger' }}
              />
              <Distribution
                title="Incident status"
                items={security.incidents.byStatus}
                tones={{ RESOLVED: 'success', CLOSED: 'success', NEW: 'warning' }}
              />
            </div>
          ) : (
            <p className="users-profile-empty mt-5">No associated security incidents are available.</p>
          )}
          {security.incidents.recent.length > 0 && (
            <div className="mt-5">
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Recent incidents</h4>
              <ul className="users-profile-list">
                {security.incidents.recent.map((incident) => (
                  <li key={incident.id}>
                    <div className="min-w-0">
                      <Link
                        className="font-semibold text-brand-700 hover:underline"
                        to={`/admin/incidents/${incident.id}`}
                      >
                        {incident.reference}
                      </Link>
                      <p className="mt-1 truncate text-xs text-slate-500">{incident.title}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Badge
                        tone={
                          ['HIGH', 'CRITICAL'].includes(incident.severity)
                            ? 'danger'
                            : incident.severity === 'MEDIUM'
                              ? 'warning'
                              : 'success'
                        }
                      >
                        {humanize(incident.severity)}
                      </Badge>
                      <Badge>{humanize(incident.status)}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ProfileSection>
        <ProfileSection
          title="Security awareness"
          description="Current training, monthly quiz, and certificate records."
        >
          <div className="users-profile-metrics">
            <ProfileMetric icon={BookOpenCheck} label="Assigned training" value={awareness.training.assigned} />
            <ProfileMetric icon={CheckCircle2} label="Completed training" value={awareness.training.completed} />
            <ProfileMetric
              icon={Activity}
              label="Training completion"
              value={`${awareness.training.completionPercent}%`}
            />
            <ProfileMetric
              icon={BookOpenCheck}
              label="Monthly quiz participation"
              value={`${awareness.monthlyQuizzes.participated} / ${awareness.monthlyQuizzes.assigned}`}
              hint={`${awareness.monthlyQuizzes.participationPercent}% participation`}
            />
            <ProfileMetric icon={Award} label="Earned certificates" value={awareness.certificates.earned} />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Recent training</h4>
              {awareness.training.recent.length ? (
                <ul className="users-profile-list">
                  {awareness.training.recent.map((item) => (
                    <li key={item.id}>
                      <div className="min-w-0">
                        <Link
                          className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
                          to={`/admin/training/${item.trainingId}`}
                        >
                          {item.title}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.progressPercent}% complete{item.dueAt ? ` · Due ${dateLabel(item.dueAt)}` : ''}
                        </p>
                      </div>
                      <Badge
                        tone={
                          item.status === 'COMPLETED' ? 'success' : item.status === 'IN_PROGRESS' ? 'brand' : 'neutral'
                        }
                      >
                        {humanize(item.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="users-profile-empty">No active training assignments.</p>
              )}
            </div>
            <div>
              <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Recent certificates</h4>
              {awareness.certificates.recent.length ? (
                <ul className="users-profile-list">
                  {awareness.certificates.recent.map((certificate) => (
                    <li key={certificate.id}>
                      <div className="min-w-0">
                        <Link
                          className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
                          to={`/admin/certificates/${certificate.id}`}
                        >
                          {certificate.trainingTitle}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">Issued {dateLabel(certificate.issuedAt)}</p>
                      </div>
                      <Award className="size-4 shrink-0 text-success-700" aria-hidden="true" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="users-profile-empty">No earned certificates.</p>
              )}
            </div>
          </div>
        </ProfileSection>
      </div>
      <footer className="users-panel-footer">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {!user.deletedAt && <Button onClick={() => onAction('edit', user.id)}>Edit details</Button>}
      </footer>
    </div>
  );
}

function AccountForm({ user, options, onClose, onSaved, setBusy, onReload }) {
  const [draft, setDraft] = useState(() => accountDraft(user)),
    [errors, setErrors] = useState({}),
    [error, setError] = useState(null);
  const [saving, setSaving] = useState(false),
    [created, setCreated] = useState(null),
    pending = useRef(false);
  const { showToast } = useToast();
  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const validation = validateAccount(draft);
    setErrors(validation);
    setError(null);
    if (Object.keys(validation).length) {
      event.currentTarget.querySelector(`[name="${Object.keys(validation)[0]}"]`)?.focus();
      return;
    }
    pending.current = true;
    setSaving(true);
    setBusy(true);
    try {
      const result = await saveAccount(
        user ? `/api/admin/users/${user.id}/update` : '/api/admin/users',
        accountBody(draft, user),
      );
      onSaved();
      showToast({ title: user ? 'Account details updated' : 'Employee account created', tone: 'success' });
      if (user) onClose();
      else setCreated(result);
    } catch (caught) {
      if (caught.code === 'USER_EMAIL_EXISTS') setErrors({ email: 'This email is already assigned to an account.' });
      else if (caught.code === 'USER_EMPLOYEE_ID_EXISTS')
        setErrors({ employeeIdentifier: 'This employee ID is already assigned to an account.' });
      else setError(caught);
    } finally {
      pending.current = false;
      setSaving(false);
      setBusy(false);
    }
  }
  if (created)
    return (
      <div className="users-panel-form">
        <div className="users-panel-body space-y-6">
          <div className="flex items-center gap-3 text-success-700">
            <CheckCircle2 className="size-6" />
            <h3 className="text-lg font-bold">Employee account created</h3>
          </div>
          <AccountHeading user={created.user} />
          <p className="text-sm text-slate-600">Employee ID: {created.user.employeeIdentifier ?? 'Not assigned'}</p>
          {created.setup ? (
            <SetupLinkReceipt setup={created.setup} />
          ) : created.user.status === 'INVITED' ? (
            <OnboardingNotice />
          ) : (
            <p className="text-sm leading-6 text-slate-600">
              This account is inactive and cannot sign in. Activate it when you are ready to begin secure account setup.
            </p>
          )}
        </div>
        <footer className="users-panel-footer">
          <Button onClick={onClose}>Done</Button>
        </footer>
      </div>
    );
  return (
    <form className="users-panel-form" onSubmit={submit} noValidate>
      <div className="users-panel-body space-y-6">
        <p className="text-sm leading-6 text-slate-500">
          {user
            ? 'Update identity and organization details. Role and account access are managed through separate actions.'
            : 'Create an employee account and assign it to the correct department.'}
        </p>
        <fieldset disabled={saving} className="space-y-5">
          <legend className="mb-3 text-sm font-bold text-navy-900">Employee information</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['firstName', 'First name'],
              ['lastName', 'Last name'],
            ].map(([key, label]) => (
              <Field key={key} id={`user-${key}`} label={label} error={errors[key]} required>
                {(props) => (
                  <Input
                    {...props}
                    name={key}
                    autoComplete="off"
                    maxLength={100}
                    value={draft[key]}
                    onChange={(event) => set(key, event.target.value)}
                  />
                )}
              </Field>
            ))}
          </div>
          <Field
            id="user-employee-id"
            label="Employee ID"
            hint="Optional. Separate from the internal user ID."
            error={errors.employeeIdentifier}
          >
            {(props) => (
              <Input
                {...props}
                name="employeeIdentifier"
                autoComplete="off"
                maxLength={80}
                placeholder="e.g. EWA-1042"
                value={draft.employeeIdentifier}
                onChange={(event) => set('employeeIdentifier', event.target.value)}
              />
            )}
          </Field>
          <Field id="user-email" label="Work email" error={errors.email} required>
            {(props) => (
              <Input
                {...props}
                name="email"
                type="email"
                autoComplete="off"
                maxLength={254}
                value={draft.email}
                onChange={(event) => set('email', event.target.value)}
              />
            )}
          </Field>
          <Field id="user-department" label="Department" error={errors.departmentId} required>
            {(props) => (
              <Select
                {...props}
                name="departmentId"
                value={draft.departmentId}
                onChange={(event) => set('departmentId', event.target.value)}
              >
                <option value="">Select a department</option>
                {options.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </fieldset>
        <div className="border-t border-slate-100 pt-5">
          <p className="mb-3 text-sm font-bold text-navy-900">Account access</p>
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-sm text-slate-600">Account role</span>
            <RoleBadge role={user?.role.name ?? 'EMPLOYEE'} />
          </div>
          {user ? (
            <p className="text-xs leading-5 text-slate-500">
              Use “Change role” in the account actions menu for an authorized role change. Changing the email signs the
              user out and invalidates pending setup.
            </p>
          ) : (
            <>
              <Field id="user-initial-status" label="Initial account status">
                {(props) => (
                  <Select
                    {...props}
                    disabled={saving}
                    value={draft.status}
                    onChange={(event) => set('status', event.target.value)}
                  >
                    <option value="INVITED">Setup pending</option>
                    <option value="DEACTIVATED">Inactive</option>
                  </Select>
                )}
              </Field>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                New accounts start as employees. Administrator access requires a separate authorized role change after
                account setup.
              </p>
            </>
          )}
        </div>
        {!user && <OnboardingNotice demo={options.manualSetupEnabled} />}
        <RequestError error={error} onReload={onReload} />
      </div>
      <footer className="users-panel-footer">
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : user ? 'Save changes' : 'Create employee'}
        </Button>
      </footer>
    </form>
  );
}

const actionCopy = {
  activate: [
    'Restore account access',
    'This restores access according to the assigned role and existing authentication requirements. An account without a password returns to setup pending. Previous sessions remain invalid.',
  ],
  suspend: [
    'Temporarily suspend access',
    'The user will be signed out and cannot sign in or access protected services until an administrator activates the account. Historical records are preserved.',
  ],
  deactivate: [
    'Deactivate this account',
    'The user will be signed out and access will be disabled. The account stays in the directory and its security and training records are preserved. You can activate it again later.',
  ],
  delete: [
    'Remove access and retain records',
    'This is soft deletion, not permanent deletion. Access and credentials are removed, while identity and historical records are retained. The account leaves the default directory. Restoring removed accounts is not supported.',
  ],
  role: [
    'Review access permissions',
    'Changing a role signs the user out and clears prior administrator MFA enrollment. Administrator access requires fresh MFA enrollment at the next sign-in.',
  ],
};
function AccountAction({ user, mode, onSaved, onClose, setBusy, onReload }) {
  const [confirmation, setConfirmation] = useState(''),
    [role, setRole] = useState(user.role.name === 'EMPLOYEE' ? 'IT_SECURITY_ADMIN' : 'EMPLOYEE');
  const [error, setError] = useState(null),
    [saving, setSaving] = useState(false),
    pending = useRef(false);
  const { showToast } = useToast(),
    confirmId = user.employeeIdentifier ?? user.id;
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setBusy(true);
    setError(null);
    const operation = mode === 'delete' ? 'delete' : mode === 'role' ? 'role' : 'status';
    const body = {
      expectedUpdatedAt: user.updatedAt,
      ...(mode === 'delete'
        ? { confirmation }
        : mode === 'role'
          ? { role }
          : { status: { activate: 'ACTIVE', suspend: 'SUSPENDED', deactivate: 'DEACTIVATED' }[mode] }),
    };
    try {
      const result = await saveAccount(`/api/admin/users/${user.id}/${operation}`, body);
      onSaved();
      onClose();
      showToast({
        title: mode === 'delete' ? 'Account removed; records retained' : 'Account access updated',
        message: result.setupRequired ? 'Password setup is still required. No invitation email was sent.' : undefined,
        tone: 'success',
      });
    } catch (caught) {
      setError(caught);
    } finally {
      pending.current = false;
      setSaving(false);
      setBusy(false);
    }
  }
  return (
    <form className="users-panel-form" onSubmit={submit}>
      <div className="users-panel-body space-y-5">
        <AccountHeading user={user} />
        <div className={`users-notice ${mode === 'delete' ? 'users-notice-danger' : ''}`}>
          <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
          <div>
            <strong>{actionCopy[mode][0]}</strong>
            <p>{actionCopy[mode][1]}</p>
          </div>
        </div>
        {mode === 'delete' && (
          <Field
            id="user-remove-confirm"
            label={`Type ${user.employeeIdentifier ? 'the employee ID' : 'the internal user ID'} to confirm`}
            hint={confirmId}
            required
          >
            {(props) => (
              <Input
                {...props}
                disabled={saving}
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            )}
          </Field>
        )}
        {mode === 'role' && (
          <Field id="user-new-role" label="New account role">
            {(props) => (
              <Select {...props} disabled={saving} value={role} onChange={(event) => setRole(event.target.value)}>
                {['EMPLOYEE', 'IT_SECURITY_ADMIN']
                  .filter((value) => value !== user.role.name)
                  .map((value) => (
                    <option key={value} value={value}>
                      {roleName(value)}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        )}
        <RequestError error={error} onReload={onReload} />
        <p className="text-xs leading-5 text-slate-500">
          Changes require a recent MFA sign-in and are recorded in the audit log.
        </p>
      </div>
      <footer className="users-panel-footer">
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={['delete', 'deactivate', 'suspend'].includes(mode) ? 'danger' : 'primary'}
          disabled={saving || (mode === 'delete' && confirmation !== confirmId)}
        >
          {saving ? 'Applying…' : titles[mode]}
        </Button>
      </footer>
    </form>
  );
}

export function UserPanel({ selection, options, onClose, onSaved, onAction, onReload }) {
  const [busy, setBusy] = useState(false);
  const resource = useUsersResource(
    selection.id ? `/api/admin/users/${selection.id}${selection.mode === 'view' ? '/profile' : ''}` : null,
  );
  const compact = !['add', 'view', 'edit'].includes(selection.mode);
  return (
    <PanelFrame
      title={titles[selection.mode]}
      compact={compact}
      wide={selection.mode === 'view'}
      busy={busy}
      onClose={onClose}
    >
      {resource.loading ? (
        <DirectorySkeleton />
      ) : resource.error ? (
        <div className="users-panel-body">
          <StatePanel
            icon={AlertCircle}
            title="Account unavailable"
            description={userError(resource.error)}
            action={
              <Button variant="secondary" onClick={onReload}>
                Try again
              </Button>
            }
            tone="error"
          />
        </div>
      ) : selection.mode === 'add' || selection.mode === 'edit' ? (
        <AccountForm
          user={resource.data?.user}
          options={options}
          onClose={onClose}
          onSaved={onSaved}
          setBusy={setBusy}
          onReload={onReload}
        />
      ) : selection.mode === 'setup' ? (
        <SetupLinkPanel
          user={resource.data.user}
          onClose={onClose}
          onSaved={onSaved}
          setBusy={setBusy}
          onReload={onReload}
        />
      ) : selection.mode === 'view' ? (
        <AccountDetails
          demo={options.manualSetupEnabled}
          user={resource.data.user}
          profile={resource.data.profile}
          onClose={onClose}
          onAction={onAction}
        />
      ) : (
        <AccountAction
          user={resource.data.user}
          mode={selection.mode}
          onClose={onClose}
          onSaved={onSaved}
          setBusy={setBusy}
          onReload={onReload}
        />
      )}
    </PanelFrame>
  );
}
