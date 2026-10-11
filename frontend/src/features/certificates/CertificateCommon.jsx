import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, Award, Download } from 'lucide-react';
import { Badge, Button, Card, StatePanel } from '../../components/ui/index.jsx';
import { createCertificateApi } from './certificate-api.js';
import { certificateDate, certificateError } from './certificate-model.js';

export function CertificateStatus({ status }) { return <Badge tone={status === 'ISSUED' ? 'success' : 'warning'}>{status === 'ISSUED' ? 'Issued' : 'Revoked'}</Badge>; }
export function CertificateFeedback({ loading, error, retry, empty, emptyTitle = 'No certificates found', emptyDescription }) {
  if (loading) return <Card className="p-6"><p role="status" className="animate-pulse text-sm text-slate-600">Loading certificates…</p></Card>;
  if (error) return <Card className="p-6"><StatePanel icon={AlertCircle} tone="error" title="Certificates unavailable" description={error} action={retry && <Button variant="secondary" onClick={retry}>Try again</Button>} /></Card>;
  if (empty) return <Card className="p-6"><StatePanel icon={Award} title={emptyTitle} description={emptyDescription} /></Card>;
  return null;
}
export function CertificatePager({ result, onChange }) {
  if (!result) return null;
  return <nav aria-label="Certificate pages" className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-4"><span className="text-sm text-slate-500">Page {result.page}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={result.page <= 1} onClick={() => onChange(result.page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={!result.hasMore} onClick={() => onChange(result.page + 1)}>Next</Button></div></nav>;
}
export function CertificateSummary({ certificate, admin = false }) {
  return <Card className="flex h-full flex-col overflow-hidden"><div className="h-1 bg-brand-500" /><div className="flex flex-1 flex-col p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Award className="size-5" aria-hidden="true" /></span><CertificateStatus status={certificate.status} /></div><h2 className="mt-5 break-words text-lg font-bold text-slate-950">{certificate.trainingTitle}</h2>{admin && <p className="mt-1 text-sm text-slate-600">{certificate.employeeName}</p>}<dl className="mt-5 grid gap-3 text-sm"><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Certificate number</dt><dd className="mt-1 break-all font-mono text-xs text-slate-800">{certificate.certificateNumber}</dd></div><div className="grid grid-cols-2 gap-3"><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed</dt><dd className="mt-1">{certificateDate(certificate.completedAt)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issued</dt><dd className="mt-1">{certificateDate(certificate.issuedAt)}</dd></div></div>{certificate.scorePercent !== null && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Course quiz score</dt><dd className="mt-1">{certificate.scorePercent}%</dd></div>}</dl><Button as={Link} to={`${admin ? '/admin' : ''}/certificates/${certificate.id}`} variant="secondary" className="mt-6">View certificate details</Button></div></Card>;
}

export function DownloadCertificateButton({ id, admin = false, disabled = false }) {
  const api = createCertificateApi(admin);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const urls = useRef(new Set()); const timers = useRef(new Set()); const busyRef = useRef(false); const mounted = useRef(true);
  useEffect(() => { mounted.current = true; const active = urls.current, pending = timers.current;
    return () => { mounted.current = false; for (const timer of pending) window.clearTimeout(timer); pending.clear(); for (const url of active) URL.revokeObjectURL(url); active.clear(); }; }, []);
  async function download() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const blob = await api.download(id);
      if (!mounted.current) return;
      const url = URL.createObjectURL(blob); urls.current.add(url);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ewaguard-certificate-${id}.pdf`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      const timer = window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url); timers.current.delete(timer); }, 60000);
      timers.current.add(timer);
    } catch (failure) { if (mounted.current) setError(certificateError(failure, 'download')); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  return <div><Button disabled={disabled || busy} onClick={download}><Download className="size-4" aria-hidden="true" />{busy ? 'Downloading PDF…' : 'Download PDF'}</Button>{error && <p role="alert" className="mt-2 text-sm text-danger-700">{error}</p>}</div>;
}
