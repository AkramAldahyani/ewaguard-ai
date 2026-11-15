import { useRef, useState } from 'react';
import { CheckCircle2, Copy, KeyRound } from 'lucide-react';
import { Button } from '../../components/ui/index.jsx';
import { useAuth } from '../../context/auth-context.js';
import { saveAccount } from './users-api.js';
import { fullName, userError } from './users-model.js';

export function SetupLinkReceipt({ setup }) {
  const [message, setMessage] = useState(''),
    [copying, setCopying] = useState(false);
  async function copy() {
    setCopying(true);
    setMessage('');
    try {
      if (!/^[A-Za-z0-9_-]{43}$/.test(setup.token) || Date.parse(setup.expiresAt) <= Date.now()) {
        setMessage('This link has expired. Close this panel and generate a new setup link.');
        return;
      }
      const link = new URL('/account-setup', window.location.origin);
      link.hash = `token=${setup.token}`;
      await navigator.clipboard.writeText(link.href);
      setMessage('Setup link copied successfully.');
    } catch {
      setMessage('Clipboard access is unavailable. Use HTTPS or localhost and allow clipboard access, then retry.');
    } finally {
      setCopying(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-2xl border border-brand-200 bg-brand-50/50 p-5"
      aria-label="Demo account setup link"
    >
      <div className="flex items-center gap-2 font-bold text-brand-800">
        <KeyRound className="size-5" aria-hidden="true" />
        Secure account setup
      </div>
      <p className="text-sm leading-6 text-slate-600">
        Account setup is required before the employee can sign in. This single-use link expires{' '}
        {new Date(setup.expiresAt).toLocaleString()}.
      </p>
      <Button variant="secondary" disabled={copying} onClick={copy}>
        <Copy className="size-4" aria-hidden="true" />
        {copying ? 'Copying…' : 'Copy Setup Link'}
      </Button>
      {message && (
        <p role="status" className="text-sm font-semibold text-brand-800">
          {message}
        </p>
      )}
      <p className="border-t border-brand-200 pt-3 text-xs leading-5 text-slate-600">
        <strong>Controlled demonstration only.</strong> Anyone possessing an unexpired link may complete setup. Hand it
        directly to the intended participant after verifying their identity. The link is available only in this panel;
        closing it requires issuing a replacement. Clear your clipboard after handoff.
      </p>
    </section>
  );
}

export function SetupLinkPanel({ user, onClose, onSaved, setBusy, onReload }) {
  const [setup, setSetup] = useState(null),
    [error, setError] = useState(null),
    [saving, setSaving] = useState(false);
  const pending = useRef(false),
    { logout } = useAuth();
  async function issue() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setBusy(true);
    setError(null);
    try {
      const result = await saveAccount(`/api/admin/users/${user.id}/setup`, { expectedUpdatedAt: user.updatedAt });
      setSetup(result.setup);
      onSaved();
    } catch (caught) {
      setError(caught);
    } finally {
      pending.current = false;
      setSaving(false);
      setBusy(false);
    }
  }
  return (
    <div className="users-panel-form">
      <div className="users-panel-body space-y-5">
        <div>
          <h3 className="text-lg font-bold text-navy-900">{fullName(user)}</h3>
          <p className="mt-1 text-sm text-slate-500">Employee ID: {user.employeeIdentifier ?? 'Not assigned'}</p>
        </div>
        {setup ? (
          <>
            <p className="flex items-center gap-2 font-semibold text-success-700">
              <CheckCircle2 className="size-5" />
              New setup link ready
            </p>
            <SetupLinkReceipt setup={setup} />
          </>
        ) : (
          <p className="text-sm leading-6 text-slate-600">
            Generate a single-use setup link for this demonstration participant. Any earlier setup link will immediately
            stop working. This does not change a suspended or deactivated account into an active account.
          </p>
        )}
        {error && (
          <div role="alert" className="users-error">
            <p>{userError(error)}</p>
            {error.code === 'USER_CONFLICT' && (
              <Button variant="secondary" onClick={onReload}>
                Reload account
              </Button>
            )}
            {['USER_REAUTH_REQUIRED', 'USER_ACCESS_DENIED'].includes(error.code) && (
              <Button variant="secondary" onClick={() => logout().catch(() => {})}>
                Sign out to verify again
              </Button>
            )}
          </div>
        )}
      </div>
      <footer className="users-panel-footer">
        <Button variant="secondary" disabled={saving} onClick={onClose}>
          {setup ? 'Done' : 'Cancel'}
        </Button>
        {!setup && (
          <Button disabled={saving} onClick={issue}>
            {saving ? 'Generating…' : 'Generate New Setup Link'}
          </Button>
        )}
      </footer>
    </div>
  );
}
