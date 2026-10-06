import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mail, ShieldCheck, Upload } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card, Field, Textarea } from '../../components/ui/index.jsx';
import { SensitiveInformationNotice } from '../disclaimer/SensitiveInformationNotice.jsx';
import { createEmailFlow, byteLength, formatBytes, EMAIL_INPUT_LIMITS } from './email-state.js';
import { EmailResults } from './EmailResults.jsx';

export function EmailInputForm({ state, flow }) {
  const picker = useRef(null);
  const busy = ['validating', 'submitting'].includes(state.status);
  return <form noValidate onSubmit={(event) => { event.preventDefault(); void flow.submit(); }} aria-busy={busy}>
    <fieldset disabled={busy} className="min-w-0"><legend className="mb-3 text-sm font-bold">Choose input mode</legend><div className="mb-6 flex flex-wrap gap-2">{[['paste', 'Paste Email'], ['eml', 'Upload .eml']].map(([mode, label]) => <label key={mode} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${state.mode === mode ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600'}`}><input type="radio" name="email-mode" value={mode} checked={state.mode === mode} onChange={() => flow.changeMode(mode)} className="accent-brand-600" />{label}</label>)}</div>
      {state.mode === 'paste' ? <div className="space-y-5">
        <Field id="email-body" label="Email body" required hint={`${state.body.length.toLocaleString()} characters · ${formatBytes(byteLength(state.body))} / 24 KiB. UTF-8 size applies; input is never truncated.`} error={byteLength(state.body) > EMAIL_INPUT_LIMITS.body ? 'Body exceeds 24 KiB.' : ''}>{(field) => <Textarea {...field} value={state.body} onChange={(event) => flow.edit('body', event.target.value)} className="min-h-52" autoComplete="off" spellCheck={false} placeholder="Paste the message you want to review…" />}</Field>
        <Field id="email-headers" label="Raw headers (optional)" hint={`${formatBytes(byteLength(state.headers))} / 8 KiB. Headers may provide sender and unverified authentication evidence.`} error={byteLength(state.headers) > EMAIL_INPUT_LIMITS.headers ? 'Headers exceed 8 KiB.' : ''}>{(field) => <Textarea {...field} value={state.headers} onChange={(event) => flow.edit('headers', event.target.value)} autoComplete="off" spellCheck={false} placeholder="From: sender@example.com" />}</Field>
      </div> : <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy) flow.selectFiles(Array.from(event.dataTransfer.files)); }} className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-5 text-center sm:p-8"><Upload className="mx-auto mb-3 size-7 text-brand-700" aria-hidden="true" /><label htmlFor="email-file" className="block font-bold text-slate-900">Choose or drop one .eml file</label><p id="email-file-hint" className="mt-2 text-sm text-slate-600">Up to 1 MiB. No HTML or attachments will be opened.</p><input ref={picker} id="email-file" type="file" accept=".eml,message/rfc822" aria-describedby="email-file-hint" className="mt-5 block w-full min-w-0 text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-semibold" onChange={(event) => { flow.selectFiles(Array.from(event.target.files)); event.target.value = ''; }} />{state.file && <div className="mt-4 rounded-xl bg-white p-4"><p className="break-all font-semibold">{state.file.name}</p><p className="text-sm text-slate-500">{formatBytes(state.file.size)}</p><Button variant="ghost" size="sm" onClick={() => { flow.selectFiles([]); picker.current?.focus(); }}>Remove file</Button></div>}</div>}
      <div className="mt-6 flex flex-wrap gap-3"><Button type="submit" disabled={busy}><Mail className="size-4" aria-hidden="true" />{busy ? 'Analyzing email…' : 'Analyze Email'}</Button><Button variant="secondary" onClick={flow.reset}>Reset / Clear</Button></div>
    </fieldset>
  </form>;
}

export function EmailAnalyzerPage() {
  const [flow] = useState(createEmailFlow);
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const errorRef = useRef(null);
  const resultRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => () => flow.dispose(), [flow]);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);
  useEffect(() => {
    if (state.result) resultRef.current?.focus();
    else if (state.acknowledged) inputRef.current?.focus();
  }, [state.result, state.acknowledged]);
  return <div className="mx-auto w-full max-w-6xl min-w-0">
    <PageHeader eyebrow="Security analysis" title="Analyze Email" description="Review suspicious messages using local email checks, then understand the evidence and the next steps." />
    <div role="status" aria-live="polite" className="mb-3 text-sm font-semibold text-brand-700">{state.status === 'submitting' ? 'Analyzing email… Reviewing message structure and available evidence.' : state.status === 'validating' ? 'Checking your input…' : state.status === 'success' ? 'Email analysis complete.' : ''}</div>
    {state.error && <div ref={errorRef} tabIndex={-1} role="alert" className="mb-5 rounded-xl border border-warning-300 bg-warning-50 p-4 text-sm font-medium text-warning-900">{state.error}</div>}
    {!state.acknowledged && <SensitiveInformationNotice key={state.noticeKey} context="EMAIL_ANALYSIS" continuation="email analysis" onAcknowledged={flow.acknowledge} />}
    {state.acknowledged && !state.result && <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><Card className="min-w-0 p-5 sm:p-7"><h2 ref={inputRef} tabIndex={-1} className="mb-5 text-lg font-bold text-slate-950">Email content</h2><EmailInputForm state={state} flow={flow} /></Card><Card className="p-5 sm:p-6"><ShieldCheck className="mb-3 size-6 text-brand-700" aria-hidden="true" /><h2 className="font-bold text-slate-950">Before you analyze</h2><p className="mt-3 text-sm leading-6 text-slate-600">Submit only content permitted by your organization. Never include passwords, credentials, secrets, or confidential information.</p><p className="mt-3 text-sm leading-6 text-slate-600">Submitted content is sent to the server for analysis. Raw email content and uploaded .eml files are not persisted by this analyzer. Minimized evidence is stored.</p><p className="mt-3 text-sm leading-6 text-slate-600">These checks do not verify URL reputation or scan attachments for malware. Findings are provisional.</p></Card></div>}
    {state.result && <section aria-labelledby="email-result-title"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 id="email-result-title" ref={resultRef} tabIndex={-1} className="text-xl font-bold text-slate-950">Email analysis result</h2><div className="flex flex-wrap gap-2"><Button onClick={flow.reset}>Analyze Another Email</Button><Button variant="secondary" onClick={flow.reset}>Clear Result</Button></div></div><EmailResults analysis={state.result} /></section>}
  </div>;
}
