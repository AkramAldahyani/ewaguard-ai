import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react';
import { Button } from '../../components/ui/index.jsx';
import { OnboardingShell, PasswordField, PasswordStrength } from './OnboardingShell.jsx';
import { passwordScore } from './password-score.js';
import { apiRequest } from '../../services/api.js';
import { passwordIssue } from './setup-link.js';

const invalidLink =
  'This setup link is invalid or has expired. Please contact your administrator to request a new link.';
const failureMessage = (error) =>
  error.code === 'SETUP_INVALID'
    ? invalidLink
    : error.status === 429
      ? 'Too many setup attempts. Please wait 15 minutes before trying again.'
      : 'Account setup is temporarily unavailable. Please try again.';

export function AccountSetupPage({ initialToken }) {
  const token = useRef(initialToken),
    pending = useRef(false);
  const [state, setState] = useState(initialToken ? 'checking' : 'invalid');
  const [revision, setRevision] = useState(0),
    [error, setError] = useState('');
  const [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!token.current) return undefined;
    const controller = new AbortController();
    apiRequest('/api/auth/setup/validate', {
      method: 'POST',
      body: JSON.stringify({ token: token.current }),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
      .then(() => {
        if (!controller.signal.aborted) setState('ready');
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(failureMessage(caught));
        setState(caught.code === 'SETUP_INVALID' ? 'invalid' : 'error');
        if (caught.code === 'SETUP_INVALID') token.current = '';
      });
    return () => controller.abort();
  }, [revision]);
  const score = passwordScore(password);
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const issue = passwordIssue(password, confirmation);
    setError(issue);
    if (issue) return;
    if (score < 3) {
      setError('Choose a less predictable password. Try a longer, unique passphrase with unrelated words.');
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      await apiRequest('/api/auth/setup', {
        method: 'POST',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({ token: token.current, password, confirmPassword: confirmation }),
      });
      token.current = '';
      setPassword('');
      setConfirmation('');
      setState('complete');
    } catch (caught) {
      setError(
        caught.code === 'SETUP_PASSWORD_WEAK'
          ? 'Choose a less predictable password. Try a longer, unique passphrase with unrelated words.'
          : ['USER_INVALID', 'SETUP_PASSWORD_MISMATCH'].includes(caught.code)
            ? caught.code === 'SETUP_PASSWORD_MISMATCH'
              ? 'The passwords do not match.'
              : 'Use at least 12 characters and no more than 72 UTF-8 bytes.'
            : failureMessage(caught),
      );
      if (caught.code === 'SETUP_INVALID') {
        token.current = '';
        setPassword('');
        setConfirmation('');
        setState('invalid');
      }
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <OnboardingShell
      label="Employee account setup"
      eyebrow="Secure account setup"
      title={
        state === 'complete'
          ? 'Account Setup Complete'
          : state === 'invalid'
            ? 'Setup link unavailable'
            : 'Welcome to EWAGuard AI'
      }
    >
      {state === 'checking' && (
        <p role="status" className="mt-6 flex items-center gap-2 text-sm text-slate-600">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Checking your setup link…
        </p>
      )}
      {state === 'invalid' && (
        <>
          <p role="alert" className="mt-4 text-sm leading-6 text-slate-600">
            {invalidLink}
          </p>
          <Button as="a" href="/login" variant="secondary" className="mt-6">
            Go to Login
          </Button>
        </>
      )}
      {state === 'error' && (
        <>
          <p role="alert" className="mt-4 text-sm text-danger-700">
            {error}
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => {
              setState('checking');
              setError('');
              setRevision((n) => n + 1);
            }}
          >
            Try again
          </Button>
        </>
      )}
      {state === 'complete' && (
        <div className="mt-5 space-y-5">
          <CheckCircle2 className="size-12 text-success-600" aria-hidden="true" />
          <p className="text-sm leading-6 text-slate-600">
            Your EWAGuard AI account is ready. You can now sign in using your registered email address and password.
          </p>
          <Button as="a" href="/login" className="w-full">
            Go to Login
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
      {state === 'ready' && (
        <>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Complete your account setup by creating a secure password.
          </p>
          <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
            <PasswordField
              id="setup-password"
              label="New password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError('');
              }}
              disabled={saving}
            />
            <PasswordStrength password={password} />
            <PasswordField
              id="setup-confirmation"
              label="Confirm password"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                setError('');
              }}
              disabled={saving}
            />
            {confirmation && (
              <p
                className={`text-xs ${password === confirmation ? 'text-success-700' : 'text-slate-500'}`}
                role="status"
              >
                {password === confirmation ? 'Passwords match.' : 'Passwords must match.'}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-danger-50 p-3 text-sm text-danger-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={saving}>
              {saving ? 'Completing setup…' : 'Complete Account Setup'}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
          </form>
        </>
      )}
    </OnboardingShell>
  );
}
