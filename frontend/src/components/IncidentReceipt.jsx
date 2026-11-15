import { useState } from 'react';
import { apiRequest } from '../services/api.js';
import { Button } from './ui/index.jsx';

export function IncidentReceipt({ incident, analysisId, analyzerType }) {
  const [recovered, setRecovered] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const value = recovered ?? incident;
  if (!value) return null;
  // The guidance refers to "the incident receipt", so the no-incident outcome is stated rather than left blank.
  if (value.state === 'NOT_REQUIRED')
    return (
      <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        No security incident was recorded for this result because the risk level did not require one. If you are still
        concerned, contact IT/security through your approved channel.
      </p>
    );
  async function retry() {
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest(`/api/analysis-escalations/${analyzerType}/${analysisId}/retry`, {
        method: 'POST',
        body: '{}',
      });
      setRecovered(response.incident);
    } catch {
      setError('Escalation is still pending. Contact IT/security through your approved channel.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div role="status" className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900">
      {value.state === 'RECORDED' ? (
        <p>
          Security incident recorded: <strong>{value.reference}</strong> · {value.severity} · {value.status}
          {value.urgent ? ' · Urgent review required' : ''}. The security team has been alerted and will review it. For
          urgent help, also contact IT/security through your approved channel.
        </p>
      ) : (
        <>
          <p>
            Analysis completed, but incident escalation is pending. Do not repeat the scan. Contact IT/security through
            your approved channel.
          </p>
          {analysisId && analyzerType && (
            <Button disabled={busy} onClick={retry} variant="secondary" size="sm">
              {busy ? 'Retrying…' : 'Retry incident recording'}
            </Button>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
