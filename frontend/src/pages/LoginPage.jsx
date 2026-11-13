import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import building from '../assets/branding/ewa_building.png';
import loginLogo from '../assets/branding/ewa_logo_wide.png';
import { Button, Field, Input } from '../components/ui/index.jsx';
import { useAuth } from '../context/auth-context.js';
import { MfaForm } from '../components/auth/MfaForm.jsx';
import { SecurityTips } from '../components/employee/SecurityTips.jsx';

export function LoginPage() {
  // After sign-out the tab must not keep the previous page's title (for example "Profile").
  useEffect(() => { document.title = 'Sign in | EWAGuard AI'; }, []);
  const { login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [challenge, setChallenge] = useState(null);

  function finishLogin(user) {
    const destination = location.state?.from?.pathname;
    const fallback = user.role === 'IT_SECURITY_ADMIN' ? '/admin' : '/';
    const internal = typeof destination === 'string' && destination.startsWith('/') && !destination.startsWith('//') && !destination.includes('\\');
    navigate(internal ? destination : fallback, { replace: true });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(email, password);
      setPassword('');
      if (result.mfaRequired) setChallenge(result);
      else finishLogin(result);
    } catch (requestError) {
      setError(requestError.status === 429
        ? 'Too many sign-in attempts. Please wait and try again.'
        : requestError.status === 401
          ? 'Email or password is incorrect.'
          : 'Sign in is temporarily unavailable. Please try again.');
    } finally { setSubmitting(false); }
  }

  return <main className="grid min-h-screen bg-slate-50 lg:grid-cols-2 xl:grid-cols-[60%_40%]">
    <section className="relative hidden min-h-screen overflow-hidden bg-navy-950 lg:block" aria-label="EWAGuard AI employee security workspace">
      <img src={building} alt="Electricity and Water Authority headquarters in Bahrain" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-navy-950/10" aria-hidden="true" />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,21,38,0.94)_0%,rgba(6,21,38,0.78)_28%,rgba(6,21,38,0.18)_65%,transparent_100%)]" aria-hidden="true" />
      <div className="relative flex h-full max-w-3xl flex-col justify-end p-8 pr-14 xl:p-10 xl:pr-16">
        <div className="login-hero-card bg-transparent [text-shadow:0_1px_10px_rgb(0_0_0/0.4)]">
          <div className="flex items-center gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-cyan-200"><ShieldCheck className="size-5" aria-hidden="true" /></span>
            <div>
              <p className="text-[0.65rem] font-extrabold uppercase tracking-[0.18em] text-cyan-200">Your AI-Powered Security Companion</p>
            </div>
          </div>
          <h1 className="mt-5 max-w-xl text-balance text-3xl font-bold leading-tight tracking-[-0.035em] text-white xl:text-4xl">Stay secure, stay informed, and <span className="text-cyan-200">respond with confidence.</span></h1>
          <SecurityTips />
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4 text-sm font-semibold leading-6 text-white">
            <ArrowRight className="size-4 shrink-0 text-cyan-200" aria-hidden="true" />
            <p>Sign in with your organization-provided account to continue.</p>
          </div>
        </div>
      </div>
    </section>
    <section className="flex min-w-0 min-h-screen items-center justify-center px-5 py-8 sm:px-10 lg:px-6 xl:px-10" aria-label="Sign in">
      <div className="w-full max-w-md">
        <img src={loginLogo} alt="EWAGuard AI" className="mx-auto mb-6 h-auto w-4/5 object-contain" />
        <div className="mb-6 text-center lg:hidden">
          <p className="text-xs font-semibold text-brand-700">Your AI-Powered Security Companion</p>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-600">Stay secure, stay informed, and respond with confidence.</p>
        </div>
        <div className="rounded-3xl border border-slate-200/70 bg-white p-7 shadow-[0_12px_40px_-16px_rgb(15_23_42/0.18)] sm:p-9">
          {challenge ? <MfaForm challenge={challenge} onComplete={finishLogin} onCancel={() => setChallenge(null)} /> : <><div className="mb-7">
            <p className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-brand-700"><LockKeyhole className="size-4" aria-hidden="true" />Protected access</p>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">Welcome to EWAGuard AI</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Sign in with your organization-provided email address.</p>
          </div>
          {sessionExpired && <div className="mb-5 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-warning-900" role="status">Your session expired. Sign in again to continue.</div>}
          {error && <div className="mb-5 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700" role="alert">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-5">
            <Field id="email" label="Email address" required>{(field) => <Input {...field} type="email" autoComplete="username" autoCapitalize="none" spellCheck="false" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@ewa.bh" />}</Field>
            <Field id="password" label="Password" required>{(field) => <div className="relative"><Input {...field} type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="************" className="pr-12" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>}</Field>
            <Button type="submit" size="lg" className="w-full" disabled={submitting || !email.trim() || !password}>{submitting ? 'Signing in…' : 'Sign in securely'}</Button>
          </form>
          </>}
          <p className="mt-6 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500">Access is limited to authorized users. Contact your IT/security administrator if you cannot access your provisioned account.</p>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">Electricity &amp; Water Authority · EWAGuard AI</p>
      </div>
    </section>
  </main>;
}
