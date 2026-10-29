import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { Button, Card, StatePanel } from '../../components/ui/index.jsx';
import { SecurityAnalyticsContent } from './SecurityAnalyticsPage.jsx';
import { securityAnalyticsApi, securityAnalyticsError, validateSecurityRange } from './security-analytics-api.js';
import { AnalyticsPeriodFilter } from './AnalyticsPeriodFilter.jsx';

export function IncidentStatisticsPage() {
  const [draft, setDraft] = useState({ period: '30d', start: '', end: '' });
  const [applied, setApplied] = useState({ period: '30d' });
  const [revision, setRevision] = useState(0);
  const [validation, setValidation] = useState('');
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) setState({ loading: true, data: null, error: '' }); });
    securityAnalyticsApi.overview(applied, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ loading: false, data, error: '' }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ loading: false, data: null, error: securityAnalyticsError(error) }); });
    return () => controller.abort();
  }, [applied, revision]);
  function apply(event) {
    event.preventDefault();
    const error = validateSecurityRange(draft.period, draft.start, draft.end);
    setValidation(error);
    if (error) return;
    setApplied(draft.period === 'custom' ? { period: 'custom', start: draft.start, end: draft.end } : { period: draft.period });
  }
  return <><PageHeader eyebrow="Security operations" title="Incident Statistics" actions={<><Button as={Link} to="/admin/analytics/security" variant="secondary">Security analytics</Button><Button variant="secondary" disabled={state.loading} onClick={() => setRevision((value) => value + 1)}><RefreshCw className="size-4" aria-hidden="true" />Refresh statistics</Button></>} />
    <AnalyticsPeriodFilter draft={draft} applied={applied} setDraft={(update) => { setDraft(update); setValidation(''); }} validation={validation} errorId="incident-statistics-period-error" onSubmit={apply} subject="incident statistics panels" />
    {state.loading && <Card role="status" aria-label="Loading incident statistics" className="p-8 text-sm text-slate-600">Loading incident statistics…</Card>}
    {state.error && <Card className="p-5"><StatePanel icon={AlertCircle} tone="error" title="Incident statistics unavailable" description={state.error} action={<Button variant="secondary" onClick={() => setRevision((value) => value + 1)}>Try again</Button>} /></Card>}
    {state.data && !state.loading && <SecurityAnalyticsContent data={state.data} />}</>;
}
