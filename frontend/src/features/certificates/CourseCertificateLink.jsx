import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/index.jsx';
import { createCertificateApi } from './certificate-api.js';

const api = createCertificateApi();
export function CourseCertificateLink({ trainingId }) {
  const [state, setState] = useState({ loading: true, certificate: null, error: false });
  useEffect(() => { const controller = new AbortController();
    async function find() { try {
      // Listing reconciles eligible historical completions on the server.
      for (let page = 1; page <= 10; page++) {
        const result = await api.list({ page, pageSize: 50 }, controller.signal);
        if (controller.signal.aborted) return;
        const certificate = result.items.find((item) => item.trainingId === trainingId && item.status === 'ISSUED');
        if (certificate || !result.hasMore) { setState({ loading: false, certificate: certificate ?? null, error: false }); return; }
      }
      setState({ loading: false, certificate: null, error: true });
    } catch (error) { if (error.name !== 'AbortError' && !controller.signal.aborted) setState({ loading: false, certificate: null, error: true }); } }
    void find(); return () => controller.abort(); }, [trainingId]);
  if (state.loading) return <p role="status" className="mt-3 text-sm text-success-800">Checking certificate issuance…</p>;
  if (state.certificate) return <Button as={Link} to={`/certificates/${state.certificate.id}`} variant="secondary" className="mt-4">View earned certificate</Button>;
  return <p className="mt-3 text-sm text-success-800">{state.error ? 'Certificate availability could not be checked.' : 'A certificate is not available for this completion yet.'} <Link to="/certificates" className="font-semibold underline underline-offset-2">My Certificates</Link></p>;
}
