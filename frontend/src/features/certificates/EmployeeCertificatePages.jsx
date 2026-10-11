import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Award, BookOpenCheck, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card } from '../../components/ui/index.jsx';
import { createCertificateApi } from './certificate-api.js';
import { CertificateFeedback, CertificatePager, CertificateStatus, CertificateSummary, DownloadCertificateButton } from './CertificateCommon.jsx';
import { certificateDate, certificateError } from './certificate-model.js';

const api = createCertificateApi();
export function EmployeeCertificateListPage() {
  const [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, error: '', result: null });
  useEffect(() => { const controller = new AbortController();
    api.list({ page, pageSize: 20 }, controller.signal).then((result) => { if (!controller.signal.aborted) setState({ loading: false, error: '', result }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ loading: false, error: certificateError(error), result: null }); });
    return () => controller.abort(); }, [page, revision]);
  const refresh = () => { setState({ loading: true, error: '', result: null }); setRevision((value) => value + 1); };
  return <><PageHeader eyebrow="Security awareness" title="My Certificates" description="Your verified record of completed security awareness training." actions={<Button variant="secondary" onClick={refresh}><RefreshCw className="size-4" aria-hidden="true" />Refresh</Button>} />
    <Card className="mb-6 flex items-start gap-4 p-5 sm:p-6"><BookOpenCheck className="mt-0.5 size-6 shrink-0 text-brand-700" aria-hidden="true" /><div><h2 className="font-bold text-slate-900">How certificates are earned</h2><p className="mt-1 text-sm leading-6 text-slate-600">Complete every reading section of an assigned course. If the course requires a quiz, pass that course quiz too. The server issues qualifying certificates automatically, including for eligible earlier completions. Monthly quizzes do not issue training certificates.</p><Button as={Link} to="/training" variant="ghost" className="mt-3">View My Training →</Button></div></Card>
    <CertificateFeedback loading={state.loading} error={state.error} retry={refresh} empty={state.result?.items.length === 0} emptyTitle="No earned certificates yet" emptyDescription="Your certificate will appear here after an assigned course meets its completion requirements." />
    {state.result?.items.length > 0 && <><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{state.result.items.map((certificate) => <CertificateSummary key={certificate.id} certificate={certificate} />)}</div><Card className="mt-5"><CertificatePager result={state.result} onChange={setPage} /></Card></>}
  </>;
}

export function EmployeeCertificateDetailPage() {
  const { id } = useParams(); const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ id, loading: true, error: '', certificate: null });
  const refresh = useCallback(() => { setState({ id, loading: true, error: '', certificate: null }); setRevision((value) => value + 1); }, [id]);
  useEffect(() => { const controller = new AbortController();
    api.detail(id, controller.signal).then(({ certificate }) => { if (!controller.signal.aborted) setState({ id, loading: false, error: '', certificate }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ id, loading: false, error: certificateError(error), certificate: null }); });
    return () => controller.abort(); }, [id, revision]);
  const current = state.id === id; const certificate = current ? state.certificate : null;
  return <><Button as={Link} to="/certificates" variant="ghost" className="mb-4">← My Certificates</Button><PageHeader eyebrow="Earned certificate" title={certificate?.trainingTitle ?? 'Certificate details'} description="Details from your issued training certificate." />
    <CertificateFeedback loading={!current || state.loading} error={current ? state.error : ''} retry={refresh} />
    {certificate && <Card className="overflow-hidden"><div className="h-1.5 bg-brand-600" /><div className="p-6 sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><Award className="size-9 text-brand-700" aria-hidden="true" /><p className="mt-4 ui-section-label">Certificate of completion</p><h2 className="mt-2 break-words text-2xl font-bold text-slate-950">{certificate.trainingTitle}</h2></div><CertificateStatus status={certificate.status} /></div><dl className="mt-8 grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Certificate number</dt><dd className="mt-1 break-all font-mono text-sm">{certificate.certificateNumber}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee</dt><dd className="mt-1 text-sm">{certificate.employeeName}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed</dt><dd className="mt-1 text-sm">{certificateDate(certificate.completedAt)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Issued</dt><dd className="mt-1 text-sm">{certificateDate(certificate.issuedAt)}</dd></div>{certificate.scorePercent !== null && <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Course quiz score</dt><dd className="mt-1 text-sm">{certificate.scorePercent}%</dd></div>}</dl><div className="mt-8 flex flex-wrap gap-3 border-t border-slate-100 pt-6"><DownloadCertificateButton id={certificate.id} disabled={certificate.status !== 'ISSUED'} /><Button as={Link} to="/training" variant="secondary">My Training</Button></div></div></Card>}
  </>;
}
