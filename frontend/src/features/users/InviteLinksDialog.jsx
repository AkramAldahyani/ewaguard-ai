import { useRef, useState } from 'react';
import { CheckCircle2, Copy, Link2 } from 'lucide-react';
import { Badge, Button, Field, Input, Select } from '../../components/ui/index.jsx';
import { Modal } from '../../components/ui/Dialog.jsx';
import { apiRequest } from '../../services/api.js';
import { useAuth } from '../../context/auth-context.js';
import { useUsersResource } from './users-api.js';
import { inviteLink, userError } from './users-model.js';

const VALIDITY = [
  [1, '1 hour'],
  [24, '24 hours'],
  [48, '2 days'],
  [168, '7 days'],
];
const STATES = {
  ACTIVE: ['success', 'Active'],
  EXPIRED: ['neutral', 'Expired'],
  EXHAUSTED: ['neutral', 'Fully used'],
  REVOKED: ['danger', 'Revoked'],
};
const emptyDraft = { label: '', departmentId: '', maxUses: '10', expiresInHours: '48', emailDomain: '' };
const when = (value) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function InviteReceipt({ receipt }) {
  const [message, setMessage] = useState(''),
    [manual, setManual] = useState(false);
  const link = inviteLink(receipt.token);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setMessage('Invite link copied.');
    } catch {
      setManual(true);
      setMessage('Clipboard access is unavailable. Select the link below and copy it manually.');
    }
  }
  return (
    <section className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-5" aria-label="New invite link">
      <p className="flex items-center gap-2 font-semibold text-success-700">
        <CheckCircle2 className="size-5" aria-hidden="true" />
        Invite link ready
      </p>
      <p className="text-sm leading-6 text-slate-600">
        Up to {receipt.invite.maxUses} {receipt.invite.maxUses === 1 ? 'person' : 'people'} can use this link to create
        an employee account in {receipt.invite.department.name} until {when(receipt.invite.expiresAt)}.
      </p>
      <Button variant="secondary" onClick={copy}>
        <Copy className="size-4" aria-hidden="true" />
        Copy Invite Link
      </Button>
      {manual && <Input readOnly aria-label="Invite link" value={link} onFocus={(event) => event.target.select()} />}
      {message && (
        <p role="status" className="text-sm font-semibold text-brand-800">
          {message}
        </p>
      )}
      <p className="border-t border-brand-200 pt-3 text-xs leading-5 text-slate-600">
        <strong>Share it only with the people you intend to invite.</strong> Anyone holding the link can register until
        it expires, is fully used, or is revoked. The link is shown only now; it cannot be retrieved later.
      </p>
    </section>
  );
}

export function InviteLinksDialog({ open, onClose, departments = [], onRegistered }) {
  const [revision, setRevision] = useState(0),
    [draft, setDraft] = useState(emptyDraft),
    [receipt, setReceipt] = useState(null),
    [error, setError] = useState(null),
    [saving, setSaving] = useState(false);
  const pending = useRef(false),
    { logout } = useAuth();
  const invites = useUsersResource(open ? '/api/admin/invites' : null, revision);
  const disabled = invites.data?.enabled === false;
  const change = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }));
  async function write(path, body) {
    if (pending.current) return null;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
      setRevision((value) => value + 1);
      return result;
    } catch (caught) {
      setError(caught);
      return null;
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  async function create(event) {
    event.preventDefault();
    const maxUses = Number(draft.maxUses);
    if (!draft.label.trim() || !draft.departmentId || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 200) {
      setError({ message: 'Enter a link name, choose a department, and allow between 1 and 200 accounts.' });
      return;
    }
    const result = await write('/api/admin/invites', {
      label: draft.label.trim(),
      departmentId: draft.departmentId,
      maxUses,
      expiresInHours: Number(draft.expiresInHours),
      ...(draft.emailDomain.trim() ? { emailDomain: draft.emailDomain.trim() } : {}),
    });
    if (result) {
      setReceipt(result);
      setDraft(emptyDraft);
    }
  }
  function close() {
    // The token exists only while this dialog is open.
    setReceipt(null);
    setError(null);
    onRegistered?.();
    onClose();
  }
  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite links"
      description="Generate a link that lets people create their own employee account and sign in afterwards."
      footer={
        <Button variant="secondary" onClick={close}>
          Done
        </Button>
      }
    >
      <div className="space-y-6">
        {receipt && <InviteReceipt key={receipt.invite.id} receipt={receipt} />}
        {disabled ? (
          <p className="users-error" role="status">
            Invite links are disabled on this server (REGISTRATION_INVITES_ENABLED=false).
          </p>
        ) : (
          <form className="space-y-4" onSubmit={create} noValidate>
            <h3 className="flex items-center gap-2 font-bold text-navy-900">
              <Link2 className="size-4" aria-hidden="true" />
              New invite link
            </h3>
            <Field id="invite-label" label="Link name" hint="For your reference, e.g. “Finance onboarding”." required>
              {(field) => (
                <Input {...field} maxLength={120} value={draft.label} onChange={change('label')} disabled={saving} />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="invite-department" label="Department" hint="New accounts join this department." required>
                {(field) => (
                  <Select {...field} value={draft.departmentId} onChange={change('departmentId')} disabled={saving}>
                    <option value="">Select a department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="invite-validity" label="Valid for">
                {(field) => (
                  <Select {...field} value={draft.expiresInHours} onChange={change('expiresInHours')} disabled={saving}>
                    {VALIDITY.map(([hours, title]) => (
                      <option key={hours} value={hours}>
                        {title}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field id="invite-uses" label="Maximum accounts" hint="1–200 registrations." required>
                {(field) => (
                  <Input
                    {...field}
                    type="number"
                    min={1}
                    max={200}
                    value={draft.maxUses}
                    onChange={change('maxUses')}
                    disabled={saving}
                  />
                )}
              </Field>
              <Field id="invite-domain" label="Restrict email domain" hint="Optional, e.g. ewa.bh">
                {(field) => (
                  <Input
                    {...field}
                    maxLength={253}
                    placeholder="Any email domain"
                    value={draft.emailDomain}
                    onChange={change('emailDomain')}
                    disabled={saving}
                  />
                )}
              </Field>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Working…' : 'Generate Invite Link'}
            </Button>
          </form>
        )}
        {error && (
          <div role="alert" className="users-error">
            <p>{userError(error)}</p>
            {['USER_REAUTH_REQUIRED', 'USER_ACCESS_DENIED'].includes(error.code) && (
              <Button variant="secondary" className="mt-2" onClick={() => logout().catch(() => {})}>
                Sign out to verify again
              </Button>
            )}
          </div>
        )}
        <section aria-label="Existing invite links" className="border-t border-slate-200 pt-5">
          <h3 className="font-bold text-navy-900">Recent links</h3>
          {invites.loading && (
            <p role="status" className="mt-3 text-sm text-slate-500">
              Loading invite links…
            </p>
          )}
          {invites.error && (
            <p role="alert" className="users-error mt-3">
              {userError(invites.error)}
            </p>
          )}
          {invites.data && !invites.data.items.length && (
            <p className="mt-3 text-sm text-slate-500">No invite links have been generated yet.</p>
          )}
          <ul className="mt-3 space-y-3">
            {invites.data?.items.map((invite) => {
              const [tone, title] = STATES[invite.state] ?? ['neutral', invite.state];
              return (
                <li key={invite.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words text-sm font-bold text-slate-800">{invite.label}</p>
                    <Badge tone={tone}>{title}</Badge>
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">
                    {invite.department.name} · {invite.useCount} of {invite.maxUses} used
                    {invite.emailDomain ? ` · @${invite.emailDomain} only` : ''} · Expires {when(invite.expiresAt)}
                  </p>
                  {invite.state === 'ACTIVE' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-danger-700"
                      disabled={saving}
                      onClick={() => write(`/api/admin/invites/${invite.id}/revoke`, {})}
                    >
                      Revoke link
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
