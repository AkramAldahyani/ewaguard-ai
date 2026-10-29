import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import zxcvbn from 'zxcvbn';
import logo from '../../assets/branding/ewa_logo_wide.png';
import building from '../../assets/branding/ewa_building.png';
import { Button, Field, Input } from '../../components/ui/index.jsx';
import { apiRequest } from '../../services/api.js';
import { passwordIssue } from './setup-link.js';

const invalidLink = 'This setup link is invalid or has expired. Please contact your administrator to request a new link.';
const failureMessage = (error) => error.code === 'SETUP_INVALID' ? invalidLink : error.status === 429
  ? 'Too many setup attempts. Please wait 15 minutes before trying again.'
  : 'Account setup is temporarily unavailable. Please try again.';

function PasswordField({ id, label, value, onChange, disabled }) {
  const [visible, setVisible] = useState(false);
  return <Field id={id} label={label} required>{(field) => <div className="relative">
    <Input {...field} autoComplete="new-password" type={visible ? 'text' : 'password'} value={value} onChange={onChange}
      maxLength={72} disabled={disabled} spellCheck={false} autoCapitalize="none" className="pr-12" />
    <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}
      onClick={() => setVisible((current) => !current)} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600">
      {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
    </button>
  </div>}</Field>;
}

export function AccountSetupPage({ initialToken }) {
  const token = useRef(initialToken), pending = useRef(false);
  const [state, setState] = useState(initialToken ? 'checking' : 'invalid');
  const [revision, setRevision] = useState(0), [error, setError] = useState('');
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!token.current) return undefined;
    const controller = new AbortController();
    apiRequest('/api/auth/setup/validate', { method: 'POST', body: JSON.stringify({ token: token.current }),
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal })
      .then(() => { if (!controller.signal.aborted) setState('ready'); })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setError(failureMessage(caught)); setState(caught.code === 'SETUP_INVALID' ? 'invalid' : 'error');
        if (caught.code === 'SETUP_INVALID') token.current = '';
      });
    return () => controller.abort();
  }, [revision]);
  const score = password ? zxcvbn(password).score : 0;
  const strength = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score];
  async function submit(event) {
    event.preventDefault(); if (pending.current) return;
    const issue = passwordIssue(password, confirmation);
    setError(issue); if (issue) return;
    if (score < 3) { setError('Choose a less predictable password. Try a longer, unique passphrase with unrelated words.'); return; }
    pending.current = true; setSaving(true);
    try {
      await apiRequest('/api/auth/setup', { method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
        body: JSON.stringify({ token: token.current, password, confirmPassword: confirmation }) });
      token.current = ''; setPassword(''); setConfirmation(''); setState('complete');
    } catch (caught) {
      setError(caught.code === 'SETUP_PASSWORD_WEAK' ? 'Choose a less predictable password. Try a longer, unique passphrase with unrelated words.' : ['USER_INVALID', 'SETUP_PASSWORD_MISMATCH'].includes(caught.code)
        ? caught.code === 'SETUP_PASSWORD_MISMATCH' ? 'The passwords do not match.' : 'Use at least 12 characters and no more than 72 UTF-8 bytes.'
        : failureMessage(caught));
      if (caught.code === 'SETUP_INVALID') { token.current = ''; setPassword(''); setConfirmation(''); setState('invalid'); }
    } finally { pending.current = false; setSaving(false); }
  }
  return <main className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
    <aside className="relative hidden overflow-hidden bg-navy-950 lg:block" aria-label="EWAGuard AI security workspace">
      <img src={building} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
      <div className="relative flex min-h-screen flex-col justify-end p-12 text-white">
        <ShieldCheck className="mb-5 size-10 text-cyan-200" aria-hidden="true" />
        <h2 className="max-w-lg text-4xl font-bold tracking-tight">Your secure workspace starts here.</h2>
        <p className="mt-4 max-w-md text-base leading-7 text-slate-200">One account for threat analysis, security guidance, and awareness training.</p>
      </div>
    </aside>
    <section className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10" aria-label="Employee account setup">
      <div className="w-full max-w-lg">
        <img src={logo} alt="EWAGuard AI" className="mx-auto mb-8 w-64 max-w-full" />
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/40 sm:p-9">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-700"><KeyRound className="size-4" aria-hidden="true" />Secure account setup</p>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-950">{state === 'complete' ? 'Account Setup Complete' : state === 'invalid' ? 'Setup link unavailable' : 'Welcome to EWAGuard AI'}</h1>
          {state === 'checking' && <p role="status" className="mt-6 flex items-center gap-2 text-sm text-slate-600"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />Checking your setup link…</p>}
          {state === 'invalid' && <><p role="alert" className="mt-4 text-sm leading-6 text-slate-600">{invalidLink}</p><Button as="a" href="/login" variant="secondary" className="mt-6">Go to Login</Button></>}
          {state === 'error' && <><p role="alert" className="mt-4 text-sm text-danger-700">{error}</p><Button variant="secondary" className="mt-6" onClick={() => { setState('checking'); setError(''); setRevision((n) => n + 1); }}>Try again</Button></>}
          {state === 'complete' && <div className="mt-5 space-y-5"><CheckCircle2 className="size-12 text-success-600" aria-hidden="true" /><p className="text-sm leading-6 text-slate-600">Your EWAGuard AI account is ready. You can now sign in using your registered email address and password.</p><Button as="a" href="/login" className="w-full">Go to Login<ArrowRight className="size-4" aria-hidden="true" /></Button></div>}
          {state === 'ready' && <><p className="mt-2 text-sm leading-6 text-slate-500">Complete your account setup by creating a secure password.</p>
            <form className="mt-6 space-y-5" onSubmit={submit} noValidate>
              <PasswordField id="setup-password" label="New password" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} disabled={saving} />
              <div className="rounded-xl bg-slate-50 p-4"><div className="flex items-center justify-between text-xs"><span className="font-semibold text-slate-600">Password strength</span><span className="font-bold text-brand-800" role="status">{password ? strength : 'Not entered'}</span></div>
                <meter min="0" max="4" value={score} aria-label="Password strength" className="mt-2 h-2 w-full" />
                <p className="mt-3 text-xs leading-5 text-slate-500">Use at least 12 characters, up to 72 UTF-8 bytes, and reach Strong or Very strong. A long, unique passphrase is best. Strength is estimated locally on your device.</p>
              </div>
              <PasswordField id="setup-confirmation" label="Confirm password" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(''); }} disabled={saving} />
              {confirmation && <p className={`text-xs ${password === confirmation ? 'text-success-700' : 'text-slate-500'}`} role="status">{password === confirmation ? 'Passwords match.' : 'Passwords must match.'}</p>}
              {error && <p role="alert" className="rounded-xl bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={saving}>{saving ? 'Completing setup…' : 'Complete Account Setup'}<ArrowRight className="size-4" aria-hidden="true" /></Button>
            </form></>}
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Electricity &amp; Water Authority · EWAGuard AI</p>
      </div>
    </section>
  </main>;
}
