import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react';
import { Button, Field, Input } from '../../components/ui/index.jsx';
import { apiRequest } from '../../services/api.js';
import { OnboardingShell, PasswordField, PasswordStrength } from './OnboardingShell.jsx';
import { passwordScore } from './password-score.js';
import { passwordIssue } from './setup-link.js';

const invalidLink =
  'This invite link is invalid, expired, or has already been fully used. Please ask your administrator for a new link.';
const weakPassword = 'Choose a less predictable password. Try a longer, unique passphrase with unrelated words.';
// Public requests carry no session cookie and never expose the link to third parties.
const publicRequest = (path, body, signal) =>
  apiRequest(path, {
    method: 'POST',
    body: JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    signal,
  });
function failureMessage(error) {
  if (error.code === 'INVITE_INVALID') return invalidLink;
  if (error.code === 'SETUP_PASSWORD_WEAK') return weakPassword;
  if (error.code === 'SETUP_PASSWORD_MISMATCH') return 'The passwords do not match.';
  if (['INVITE_EMAIL_DOMAIN', 'REGISTRATION_EMAIL_UNAVAILABLE', 'USER_INVALID'].includes(error.code))
    return error.message;
  if (error.status === 429) return 'Too many registration attempts. Please wait 15 minutes before trying again.';
  return 'Registration is temporarily unavailable. Please try again.';
}

export function RegisterPage({ initialToken }) {
  const token = useRef(initialToken),
    pending = useRef(false);
  const [state, setState] = useState(initialToken ? 'checking' : 'invalid');
  const [invite, setInvite] = useState(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState('');
  const [draft, setDraft] = useState({ firstName: '', lastName: '', email: '', password: '', confirmation: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!token.current) return undefined;
    const controller = new AbortController();
    publicRequest('/api/auth/register/validate', { token: token.current }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setInvite(result);
        setState('ready');
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(failureMessage(caught));
        setState(caught.code === 'INVITE_INVALID' ? 'invalid' : 'error');
        if (caught.code === 'INVITE_INVALID') token.current = '';
      });
    return () => controller.abort();
  }, [revision]);
  const change = (key) => (event) => {
    setDraft((current) => ({ ...current, [key]: event.target.value }));
    setError('');
  };
  function issue() {
    if (!draft.firstName.trim() || !draft.lastName.trim()) return 'Enter your first and last name.';
    const email = draft.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid work email address.';
    if (invite?.emailDomain && !email.endsWith(`@${invite.emailDomain}`))
      return `Use your @${invite.emailDomain} work email address.`;
    return passwordIssue(draft.password, draft.confirmation) || (passwordScore(draft.password) < 3 ? weakPassword : '');
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    const problem = issue();
    setError(problem);
    if (problem) return;
    pending.current = true;
    setSaving(true);
    try {
      await publicRequest('/api/auth/register', {
        token: token.current,
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        email: draft.email.trim(),
        password: draft.password,
        confirmPassword: draft.confirmation,
      });
      token.current = '';
      setDraft((current) => ({ ...current, password: '', confirmation: '' }));
      setState('complete');
    } catch (caught) {
      setError(failureMessage(caught));
      if (caught.code === 'INVITE_INVALID') {
        token.current = '';
        setDraft((current) => ({ ...current, password: '', confirmation: '' }));
        setState('invalid');
      }
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <OnboardingShell
      label="Employee registration"
      eyebrow="Invitation to join"
      title={
        state === 'complete'
          ? 'Account Created'
          : state === 'invalid'
            ? 'Invite link unavailable'
            : 'Create your EWAGuard AI account'
      }
    >
      {state === 'checking' && (
        <p role="status" className="mt-6 flex items-center gap-2 text-sm text-slate-600">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Checking your invite link…
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
            Your EWAGuard AI account is ready. Sign in with <strong>{draft.email.trim()}</strong> and the password you
            just created.
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
            You were invited to join the <strong className="text-slate-700">{invite.department}</strong> department as
            an employee. Enter your details and choose a secure password.
          </p>
          <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="register-first-name" label="First name" required>
                {(field) => (
                  <Input
                    {...field}
                    autoComplete="given-name"
                    maxLength={100}
                    value={draft.firstName}
                    onChange={change('firstName')}
                    disabled={saving}
                  />
                )}
              </Field>
              <Field id="register-last-name" label="Last name" required>
                {(field) => (
                  <Input
                    {...field}
                    autoComplete="family-name"
                    maxLength={100}
                    value={draft.lastName}
                    onChange={change('lastName')}
                    disabled={saving}
                  />
                )}
              </Field>
            </div>
            <Field
              id="register-email"
              label="Work email"
              hint={invite.emailDomain ? `Must be an @${invite.emailDomain} address.` : 'You will sign in with this.'}
              required
            >
              {(field) => (
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  spellCheck={false}
                  autoCapitalize="none"
                  value={draft.email}
                  onChange={change('email')}
                  disabled={saving}
                />
              )}
            </Field>
            <PasswordField
              id="register-password"
              label="New password"
              value={draft.password}
              onChange={change('password')}
              disabled={saving}
            />
            <PasswordStrength password={draft.password} />
            <PasswordField
              id="register-confirmation"
              label="Confirm password"
              value={draft.confirmation}
              onChange={change('confirmation')}
              disabled={saving}
            />
            {error && (
              <p role="alert" className="rounded-xl bg-danger-50 p-3 text-sm text-danger-700">
                {error}
              </p>
            )}
            <Button type="submit" className="w-full" size="lg" disabled={saving}>
              {saving ? 'Creating account…' : 'Create Account'}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <p className="text-center text-xs text-slate-500">
              Already have an account?{' '}
              <a href="/login" className="font-semibold text-brand-700 hover:underline">
                Sign in
              </a>
            </p>
          </form>
        </>
      )}
    </OnboardingShell>
  );
}
