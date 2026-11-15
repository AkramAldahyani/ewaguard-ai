import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { apiRequest } from '../services/api.js';
import { IncidentAssistance } from './IncidentAssistance.jsx';
import { Button, Card } from './ui/index.jsx';
import { Modal } from './ui/Dialog.jsx';

const errors = {
  INCIDENT_SOURCE_NOT_FOUND:
    'This analysis is no longer available. Contact IT/security through your approved channel now.',
  FINALIZED_RISK_REQUIRED:
    'This analysis cannot be used for the report. Contact IT/security through your approved channel now.',
};

// The employee's explicit confirmation is the only input. The backend risk engine decides the new risk level.
export function ExposureReport({ analysisId, analyzerType }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  if (!analysisId || !['EMAIL', 'URL'].includes(analyzerType)) return null;
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest(`/api/analysis-escalations/${analyzerType}/${analysisId}/exposure`, {
        method: 'POST',
        body: JSON.stringify({ exposure: 'CREDENTIALS_SUBMITTED', confirmed: true }),
      });
      setResult(response.incident);
      setOpen(false);
    } catch (failure) {
      setError(
        errors[failure?.code] ??
          'The report could not be recorded. Contact IT/security through your approved channel now.',
      );
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }
  if (result)
    return (
      <div className="space-y-5">
        <div
          role="status"
          className="rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm leading-6 text-danger-900"
        >
          <p className="font-bold">Credential exposure reported</p>
          <p className="mt-1">
            Incident <strong>{result.reference}</strong> · {result.severity} ·{' '}
            {String(result.status).replaceAll('_', ' ')}. The security team has been alerted for urgent review.
            {result.exposureRecorded === false ? ' This exposure had already been reported.' : ''}
          </p>
          <p className="mt-1">Change the affected password now from a trusted device and follow the steps below.</p>
        </div>
        {result.assistance && <IncidentAssistance assistance={result.assistance} />}
      </div>
    );
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <KeyRound className="mt-0.5 size-5 shrink-0 text-danger-700" aria-hidden="true" />
          <div>
            <h3 className="text-base font-bold text-slate-950">Did you enter your work credentials?</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              If you typed your username, password or a verification code after opening this{' '}
              {analyzerType === 'EMAIL' ? 'email' : 'link'}, report it now. The security team will be alerted for urgent
              review. Do not type the password or code here.
            </p>
          </div>
        </div>
        <Button variant="danger" size="sm" disabled={busy} onClick={() => setOpen(true)}>
          I entered my credentials
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger-800">
          {error}
        </p>
      )}
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title="Report credential exposure"
        description="Confirm only if you actually entered your work credentials or a verification code."
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={busy} onClick={submit}>
              {busy ? 'Reporting…' : 'Yes, report exposure'}
            </Button>
          </>
        }
      >
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>An incident is recorded at critical severity and the security team is alerted.</li>
          <li>You will be asked to change your password and may be contacted by IT/security.</li>
          <li>Never include the password or code in any report or message.</li>
        </ul>
      </Modal>
    </Card>
  );
}
