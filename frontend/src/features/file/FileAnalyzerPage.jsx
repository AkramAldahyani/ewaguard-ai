import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FileSearch, Upload } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card } from '../../components/ui/index.jsx';
import { SensitiveInformationNotice } from '../disclaimer/SensitiveInformationNotice.jsx';
import { FILE_ACCEPT, FILE_EXTENSIONS, FILE_PRIVACY_NOTICE } from '../../../../shared/file-policy.js';
import { createFileFlow } from './file-state.js';
import { FileResults } from './FileResults.jsx';

export function FileInputForm({ state, flow }) {
  const picker = useRef(null); const busy = state.status === 'submitting';
  return <form noValidate onSubmit={(event) => { event.preventDefault(); void flow.submit(); }} aria-busy={busy}>
    <fieldset disabled={busy}><legend className="mb-4 font-bold">Select a file for security analysis</legend>
      <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!busy) flow.selectFiles(Array.from(event.dataTransfer.files)); }} className="rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 p-5 text-center sm:p-8">
        <Upload className="mx-auto mb-3 size-7 text-brand-700" aria-hidden="true" /><label htmlFor="file-upload" className="block font-bold">Choose or drop one file</label>
        <p id="file-upload-hint" className="mt-2 text-sm text-slate-600">Maximum 10 MiB. Content will not be opened, executed, or previewed.</p>
        <input ref={picker} id="file-upload" type="file" accept={FILE_ACCEPT} aria-describedby="file-upload-hint file-types" className="mt-5 block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:font-semibold" onChange={(event) => { flow.selectFiles(Array.from(event.target.files)); event.target.value = ''; }} />
        {state.file && <div className="mt-4 rounded-xl bg-white p-4"><p className="break-all font-semibold">{state.file.name}</p><p className="mt-2 text-sm text-slate-600">{state.file.size.toLocaleString()} bytes · Extension: {state.file.name.split('.').at(-1).toUpperCase()}</p><p className="text-xs text-slate-500">Size and extension accepted locally. The server verifies content type.</p><Button variant="ghost" size="sm" onClick={() => { flow.selectFiles([]); picker.current?.focus(); }}>Remove file</Button></div>}
      </div>
      <p id="file-types" className="mt-4 text-xs leading-6 text-slate-500">Supported extensions: {FILE_EXTENSIONS.join(', ')}. ZIP/Office containers receive bounded inspection; scripts and executables are accepted only for scanning.</p>
      <Button type="submit" className="mt-5" disabled={busy || !state.file}><FileSearch className="size-4" aria-hidden="true" />{busy ? 'Scanning file…' : 'Analyze File'}</Button>
    </fieldset><Button variant="secondary" className="mt-3" onClick={flow.reset}>Reset / Clear</Button>
  </form>;
}
export function FileAnalyzerPage() {
  const [flow] = useState(createFileFlow);
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const feedback = useRef(null);
  useEffect(() => () => flow.dispose(), [flow]);
  useEffect(() => { if (state.error || state.result) feedback.current?.focus(); }, [state.error, state.result]);
  return <div className="mx-auto w-full max-w-6xl min-w-0">
    <PageHeader eyebrow="Security analysis" title="Analyze File" description="Review file structure, local antivirus and YARA findings, and existing SHA-256 reputation without opening the file." />
    <Card className="mb-5 p-5 text-sm leading-6 text-slate-600"><h2 className="font-bold text-slate-950">Private content, minimized evidence</h2><p className="mt-2">{FILE_PRIVACY_NOTICE}</p><p className="mt-2">Only submit material permitted by company policy. Temporary copies are deleted after local scanning; hashes and minimized evidence are stored. Hash queries disclose a file fingerprint to the provider.</p></Card>
    <p role="status" aria-live="polite" className="mb-3 text-sm font-semibold text-brand-700">{state.status === 'submitting' ? 'Scanning file… The server validates and hashes the file, runs available ClamAV and YARA checks, and looks up hash reputation. This can take a few minutes.' : state.result ? 'File analysis complete. Review coverage and scanner statuses.' : ''}</p>
    {state.error && <div ref={feedback} tabIndex={-1} role="alert" className="mb-5 rounded-xl border border-warning-300 bg-warning-50 p-4">{state.error}</div>}
    {!state.acknowledged && <SensitiveInformationNotice key={state.noticeKey} context="FILE_ANALYSIS" continuation="file analysis" onAcknowledged={flow.acknowledge} />}
    {state.acknowledged && !state.result && <Card className="p-5 sm:p-7"><FileInputForm state={state} flow={flow} /></Card>}
    {state.result && <section><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 ref={feedback} tabIndex={-1} className="text-xl font-bold">File analysis result</h2><Button onClick={flow.reset}>Analyze Another File / Clear</Button></div><FileResults analysis={state.result} /></section>}
  </div>;
}
