import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, Eye, EyeOff, KeyRound, LockKeyhole, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { Badge, Button, Card, Field, Input } from '../../components/ui/index.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { analyzePassword, describeResistance, evaluatePolicy, PASSWORD_POLICY } from './password-policy.js';
import { DEFAULT_GENERATOR_OPTIONS, generatePassword } from './password-generator.js';

function SecretField({ id, label, value, onChange, visible, onToggle, placeholder, describedBy, readOnly = false }) {
  return <div className="relative"><label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-800">{label}</label>
    <Input id={id} type={visible ? 'text' : 'password'} value={value} onChange={onChange} readOnly={readOnly} autoComplete="new-password" spellCheck="false" placeholder={placeholder} aria-describedby={describedBy} className="pr-12 font-mono" />
    <button type="button" onClick={onToggle} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} className="absolute bottom-1 right-1 grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600">{visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}</button>
  </div>;
}

function PolicyChecklist({ requirements }) {
  return <ul className="grid gap-2 sm:grid-cols-2" aria-label="Password policy requirements">{requirements.map((item) => <li key={item.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${item.met ? 'border-success-200 bg-success-50 text-success-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{item.met ? <Check className="size-4 shrink-0" aria-hidden="true" /> : <X className="size-4 shrink-0" aria-hidden="true" />}<span>{item.label}</span><span className="sr-only">: {item.met ? 'met' : 'not met'}</span></li>)}</ul>;
}

function StrengthResult({ analysis }) {
  const width = `${(analysis.score + 1) * 20}%`;
  const barTone = analysis.score <= 1 ? 'bg-danger-500' : analysis.score === 2 ? 'bg-warning-500' : 'bg-success-600';
  return <div className="space-y-5" aria-live="polite"><div><div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold text-slate-700">Strength</span><Badge tone={analysis.strength.tone}>{analysis.strength.label}</Badge></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label="Password strength" aria-valuemin="0" aria-valuemax="4" aria-valuenow={analysis.score} aria-valuetext={analysis.strength.label}><div className={`h-full rounded-full transition-[width] ${barTone}`} style={{ width }} /></div><p className="mt-2 text-xs leading-5 text-slate-500">{describeResistance(analysis)}</p></div>
    <div><h3 className="mb-3 text-sm font-bold text-slate-900">Organization policy</h3><PolicyChecklist requirements={analysis.policy.requirements} /><p className={`mt-3 text-sm font-semibold ${analysis.policy.compliant ? 'text-success-700' : 'text-warning-800'}`}>{analysis.policy.compliant ? 'Meets the configured password policy.' : `${analysis.policy.failedRequirements.length} requirement${analysis.policy.failedRequirements.length === 1 ? '' : 's'} remaining.`}</p></div>
    <div><h3 className="text-sm font-bold text-slate-900">Recommendations</h3>{analysis.recommendations.length ? <ul className="mt-2 space-y-1.5 text-sm leading-6 text-slate-600">{analysis.recommendations.map((item) => <li key={item} className="flex gap-2"><span aria-hidden="true">•</span><span>{item}</span></li>)}</ul> : <p className="mt-2 text-sm leading-6 text-slate-600">No specific pattern warning was found. Use a unique password and a trusted password manager.</p>}</div></div>;
}

export function PasswordSecurityPage() {
  const [password, setPassword] = useState('');
  const [analyzerVisible, setAnalyzerVisible] = useState(false);
  const [generated, setGenerated] = useState('');
  const [generatedVisible, setGeneratedVisible] = useState(false);
  const [options, setOptions] = useState(DEFAULT_GENERATOR_OPTIONS);
  const [generatorError, setGeneratorError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const copyTimer = useRef();
  const analysis = useMemo(() => analyzePassword(password), [password]);

  useEffect(() => () => { clearTimeout(copyTimer.current); }, []);
  const reset = () => { setPassword(''); setAnalyzerVisible(false); setGenerated(''); setGeneratedVisible(false); setCopyStatus(''); setGeneratorError(''); };
  const generate = () => {
    try { setGenerated(generatePassword(options)); setGeneratedVisible(false); setCopyStatus(''); setGeneratorError(''); }
    catch (error) { setGenerated(''); setGeneratorError(error instanceof Error ? error.message : 'Password generation failed.'); }
  };
  const copy = async () => {
    if (!generated || !navigator.clipboard?.writeText) { setCopyStatus('Clipboard access is unavailable. Select and copy the password manually.'); return; }
    try { await navigator.clipboard.writeText(generated); setCopyStatus('Copied. Clear your clipboard after saving the password.'); }
    catch { setCopyStatus('Copy was blocked. Select and copy the password manually.'); }
    clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopyStatus(''), 5000);
  };
  const toggleOption = (name) => setOptions((current) => ({ ...current, [name]: !current[name] }));
  const policyRequirements = analysis?.policy.requirements ?? evaluatePolicy('').requirements;

  return <><PageHeader eyebrow="Employee security" title="Password Security" description="Assess password strength and create policy-compliant passwords entirely in this browser." breadcrumbs={['Password Security']} actions={<Button variant="secondary" onClick={reset}>Clear sensitive values</Button>} />
    <div className="mb-6 flex gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-brand-950"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden="true" /><p><strong>Private by design.</strong> Passwords on this page are not sent to the API, OpenAI, analytics, or storage. Values remain only in this page’s memory and are cleared when you leave or reset the page.</p></div>
    <div className="grid items-start gap-6 xl:grid-cols-2"><Card className="overflow-hidden"><div className="border-b border-slate-100 p-5 sm:p-6"><span className="mb-4 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><KeyRound className="size-5" aria-hidden="true" /></span><h2 className="text-lg font-bold text-slate-950">Analyze a password</h2><p className="mt-2 text-sm leading-6 text-slate-600">Checks predictable patterns with zxcvbn and compares the value with the organization policy as you type.</p></div><div className="space-y-6 p-5 sm:p-6"><SecretField id="password-analysis" label="Password to assess" value={password} onChange={(event) => setPassword(event.target.value.slice(0, PASSWORD_POLICY.maxLength))} visible={analyzerVisible} onToggle={() => setAnalyzerVisible((value) => !value)} placeholder="Enter a password locally" describedBy="password-local-note" /><p id="password-local-note" className="-mt-4 text-xs leading-5 text-slate-500">Avoid testing a password currently used for a real account. This field has no submit action.</p>{analysis ? <StrengthResult analysis={analysis} /> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5"><p className="font-semibold text-slate-800">Ready for a local check</p><p className="mt-1 text-sm leading-6 text-slate-500">Results appear here without a network request.</p><div className="mt-4"><PolicyChecklist requirements={policyRequirements} /></div></div>}</div></Card>
      <Card className="overflow-hidden"><div className="border-b border-slate-100 p-5 sm:p-6"><span className="mb-4 grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><LockKeyhole className="size-5" aria-hidden="true" /></span><h2 className="text-lg font-bold text-slate-950">Generate a password</h2><p className="mt-2 text-sm leading-6 text-slate-600">Uses the browser’s cryptographic random generator and excludes ambiguous characters.</p></div><div className="space-y-6 p-5 sm:p-6"><Field id="password-length" label={`Length: ${options.length}`} hint={`Organization policy allows ${PASSWORD_POLICY.minLength}–${PASSWORD_POLICY.maxLength} characters.`}>{({ id, required, 'aria-describedby': describedBy }) => <input id={id} required={required} aria-describedby={describedBy} type="range" min={PASSWORD_POLICY.minLength} max="64" value={options.length} onChange={(event) => setOptions((current) => ({ ...current, length: Number(event.target.value) }))} className="w-full accent-brand-600" />}</Field>
        <fieldset><legend className="text-sm font-semibold text-slate-800">Character types</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{[['uppercase', 'Uppercase letters'], ['lowercase', 'Lowercase letters'], ['numbers', 'Numbers'], ['symbols', 'Symbols']].map(([name, label]) => <label key={name} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 px-3.5 text-sm font-medium text-slate-700"><input type="checkbox" checked={options[name]} onChange={() => toggleOption(name)} className="size-4 accent-brand-600" /><span>{label}</span>{PASSWORD_POLICY[`require${name === 'numbers' ? 'Number' : name === 'symbols' ? 'Symbol' : `${name[0].toUpperCase()}${name.slice(1)}`}`] && <span className="ml-auto text-xs font-semibold text-brand-700">Required</span>}</label>)}</div></fieldset>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><SecretField id="generated-password" label="Generated password" value={generated} onChange={() => {}} readOnly visible={generatedVisible} onToggle={() => setGeneratedVisible((value) => !value)} placeholder="Generate when ready" describedBy="generator-status" /><div id="generator-status" className="mt-3 min-h-5 text-xs leading-5" aria-live="polite">{generatorError ? <span className="text-danger-700">{generatorError}</span> : copyStatus ? <span className="text-success-700">{copyStatus}</span> : <span className="text-slate-500">Generated values are not saved automatically.</span>}</div></div>
        <div className="flex flex-wrap gap-3"><Button onClick={generate}>{generated ? <><RefreshCw className="size-4" aria-hidden="true" />Regenerate</> : 'Generate password'}</Button><Button variant="secondary" onClick={copy} disabled={!generated}><Clipboard className="size-4" aria-hidden="true" />Copy</Button></div></div></Card></div>
    <Card className="mt-6 p-5 sm:p-6"><h2 className="font-bold text-slate-950">Privacy and safe use</h2><div className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3"><p>Analysis and generation run locally. This module has no backend endpoint.</p><p>No password history, telemetry, browser storage, or administrator view is created.</p><p>Use a trusted password manager and a unique password for every account. Strength estimates are guidance, not a guarantee.</p></div></Card>
  </>;
}
