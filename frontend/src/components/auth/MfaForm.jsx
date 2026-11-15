import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button, Field, Input } from '../ui/index.jsx';
import { useAuth } from '../../context/auth-context.js';

export function MfaForm({ challenge, onComplete, onCancel }) {
  const { verifyMfa, logout } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onComplete(await verifyMfa(code));
    } catch (failure) {
      setCode('');
      setError(
        failure.status === 429
          ? 'Too many attempts. Please wait before trying again.'
          : 'Verification failed. Enter a fresh code, or return to sign in if this challenge has expired.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await logout();
      onCancel();
    } catch {
      setError('Unable to cancel sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <span className="mb-4 grid size-12 place-items-center rounded-xl bg-brand-50 text-brand-700">
        <ShieldCheck />
      </span>
      <h2 className="text-2xl font-bold tracking-tight text-slate-950">
        {challenge.enrollment ? 'Set up your authenticator' : 'Verify your identity'}
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-500">
        {challenge.enrollment
          ? 'Add this account to your trusted authenticator app, then enter its six-digit code to finish setup.'
          : 'Enter the six-digit code from your authenticator app to access the administrator workspace.'}
      </p>
      {challenge.enrollment && (
        <div className="my-5 rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm">
          <p className="font-semibold text-brand-900">Manual setup key</p>
          <code className="mt-2 block select-all break-all text-brand-900">
            {new URL(challenge.provisioningUri).searchParams.get('secret')}
          </code>
          <p className="mt-3 text-xs leading-5 text-brand-900">
            Use a time-based account (SHA-1, 6 digits, 30 seconds). Keep this key private. It will not be shown after
            setup.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-50 p-3 text-sm text-danger-700">
          {error}
        </p>
      )}
      <form onSubmit={submit} className="mt-5 space-y-5">
        <Field id="totp-code" label="Authenticator code" required>
          {(field) => (
            <Input
              {...field}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              className="text-center text-xl tracking-[0.35em]"
            />
          )}
        </Field>
        <Button type="submit" className="w-full" size="lg" disabled={busy || code.length !== 6}>
          {busy ? 'Verifying…' : challenge.enrollment ? 'Enable MFA and sign in' : 'Verify and sign in'}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={cancel} disabled={busy}>
          Return to sign in
        </Button>
      </form>
    </div>
  );
}
