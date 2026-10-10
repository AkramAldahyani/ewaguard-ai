import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button, Card, StatePanel } from '../components/ui/index.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { useAuth } from '../context/auth-context.js';
import { apiRequest } from '../services/api.js';

export function AdminWorkspace() {
  const [status, setStatus] = useState('loading');
  useEffect(() => {
    const controller = new AbortController();
    apiRequest('/api/admin/workspace', { signal: controller.signal })
      .then(() => setStatus('verified'))
      .catch((error) => { if (error.name !== 'AbortError') setStatus('error'); });
    return () => controller.abort();
  }, []);
  return <><PageHeader eyebrow="Administration" title="Administrator workspace" description="Authorized access for IT and security administrators." />
    <Card className="p-6"><StatePanel icon={status === 'error' ? ShieldAlert : ShieldCheck}
      title={status === 'loading' ? 'Checking administrator access' : status === 'verified' ? 'Administrator access verified' : 'Unable to verify access'}
      description={status === 'verified' ? 'Your role and MFA session were verified by the server. Open the incident queue to review and manage security reports.' : status === 'error' ? 'Your permissions may have changed, or the service may be unavailable. Sign in again or contact your administrator.' : 'Please wait while the server checks your session.'}
      action={status === 'verified' ? <Button as={Link} to="/admin/incidents">Open incident queue</Button> : undefined} /></Card></>;
}

export function UnauthorizedPage() {
  const { user } = useAuth();
  return <Card className="p-6"><StatePanel icon={ShieldAlert} title="Access restricted"
    description="Your current role does not permit access to this area."
    action={<Button as={Link} to={user.role === 'IT_SECURITY_ADMIN' ? '/admin' : '/'}>Return to your workspace</Button>} /></Card>;
}
