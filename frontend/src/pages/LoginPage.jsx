import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import building from '../assets/branding/ewa_building-wide.png';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { Button, Field, Input } from '../components/ui/index.jsx';
import { useAuth } from '../context/auth-context.js';

export function LoginPage() {
  const { login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(identifier, password);
      const destination = location.state?.from?.pathname;
      navigate(typeof destination === 'string' && destination.startsWith('/') ? destination : '/', { replace: true });
    } catch (requestError) {
      setError(requestError.status === 429
        ? 'Too many sign-in attempts. Please wait and try again.'
        : requestError.status === 401
          ? 'Email/employee ID or password is incorrect.'
          : 'Sign in is temporarily unavailable. Please try again.');
    } finally { setSubmitting(false); }
  }

  return <main className="grid min-h-screen bg-slate-50 lg:grid-cols-[1.08fr_0.92fr]">
    <section className="relative hidden min-h-screen overflow-hidden bg-navy-950 lg:block" aria-label="EWAGuard AI employee security workspace">
      <img src={building} alt="Electricity and Water Authority headquarters in Bahrain" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-br from-navy-950/95 via-navy-950/78 to-brand-900/45" />
      <div className="brand-grid absolute inset-0 opacity-40" aria-hidden="true" />
      <div className="relative flex h-full max-w-3xl flex-col justify-end p-12 xl:p-16">
        <span className="mb-6 grid size-12 place-items-center rounded-2xl border border-white/15 bg-white/10 text-cyan-200 backdrop-blur"><ShieldCheck className="size-6" /></span>
        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-200">Employee security workspace</p>
        <h1 className="mt-4 text-4xl font-bold leading-tight tracking-[-0.04em] text-white xl:text-5xl">Security guidance, analysis, and awareness in one trusted workspace.</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-slate-200">Sign in with your organization-provisioned account to access EWAGuard AI.</p>
      </div>
    </section>
    <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10 lg:px-12">
      <div className="w-full max-w-md">
        <BrandLogo className="mb-10" />
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          <div className="mb-7"><span className="mb-4 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"><LockKeyhole className="size-5" /></span><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-brand-700">Protected access</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Secure employee sign in</h2><p className="mt-2 text-sm leading-6 text-slate-500">Use your provisioned email address or employee ID.</p></div>
          {sessionExpired && <div className="mb-5 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900" role="status">Your session expired. Sign in again to continue.</div>}
          {error && <div className="mb-5 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700" role="alert">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field id="identifier" label="Email or employee ID" required>{(field) => <Input {...field} autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="name@organization.com" />}</Field>
            <Field id="password" label="Password" required>{(field) => <div className="relative"><Input {...field} type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="pr-12" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>}</Field>
            <Button type="submit" size="lg" className="w-full" disabled={submitting || !identifier.trim() || !password}>{submitting ? 'Signing in…' : 'Sign in securely'}</Button>
          </form>
          <p className="mt-6 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">Access is limited to authorized users. Contact your IT/security administrator if you cannot access your provisioned account.</p>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Electricity &amp; Water Authority · EWAGuard AI</p>
      </div>
    </section>
  </main>;
}
