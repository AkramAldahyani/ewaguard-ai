import { useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import logo from '../../assets/branding/ewa_logo_wide.png';
import building from '../../assets/branding/ewa_building.png';
import { Field, Input } from '../../components/ui/index.jsx';
import { passwordScore } from './password-score.js';

// Shared by every public onboarding screen (account setup and invite-link registration).
export function PasswordField({ id, label, value, onChange, disabled }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field id={id} label={label} required>
      {(field) => (
        <div className="relative">
          <Input
            {...field}
            autoComplete="new-password"
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={onChange}
            maxLength={72}
            disabled={disabled}
            spellCheck={false}
            autoCapitalize="none"
            className="pr-12"
          />
          <button
            type="button"
            aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            aria-pressed={visible}
            onClick={() => setVisible((current) => !current)}
            className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
          </button>
        </div>
      )}
    </Field>
  );
}

export function PasswordStrength({ password }) {
  const score = passwordScore(password);
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-600">Password strength</span>
        <span className="font-bold text-brand-800" role="status">
          {password ? ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][score] : 'Not entered'}
        </span>
      </div>
      <meter min="0" max="4" value={score} aria-label="Password strength" className="mt-2 h-2 w-full" />
      <p className="mt-3 text-xs leading-5 text-slate-500">
        Use at least 12 characters, up to 72 UTF-8 bytes, and reach Strong or Very strong. A long, unique passphrase is
        best. Strength is estimated locally on your device.
      </p>
    </div>
  );
}

export function OnboardingShell({ label, eyebrow, title, children }) {
  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <aside
        className="relative hidden overflow-hidden bg-navy-950 lg:block"
        aria-label="EWAGuard AI security workspace"
      >
        <img src={building} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="relative flex min-h-screen flex-col justify-end p-12 text-white">
          <ShieldCheck className="mb-5 size-10 text-cyan-200" aria-hidden="true" />
          <h2 className="max-w-lg text-4xl font-bold tracking-tight">Your secure workspace starts here.</h2>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-200">
            One account for threat analysis, security guidance, and awareness training.
          </p>
        </div>
      </aside>
      <section className="flex min-w-0 items-center justify-center px-5 py-10 sm:px-10" aria-label={label}>
        <div className="w-full max-w-lg">
          <img src={logo} alt="EWAGuard AI" className="mx-auto mb-8 w-64 max-w-full" />
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/40 sm:p-9">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-700">
              <KeyRound className="size-4" aria-hidden="true" />
              {eyebrow}
            </p>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-950">{title}</h1>
            {children}
          </div>
          <p className="mt-6 text-center text-xs text-slate-500">Electricity &amp; Water Authority · EWAGuard AI</p>
        </div>
      </section>
    </main>
  );
}
