import { Link } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { Button, Card, StatePanel } from '../components/ui/index.jsx';
import { useAuth } from '../context/auth-context.js';

export function UnauthorizedPage() {
  const { user } = useAuth();
  return (
    <Card className="p-6">
      <StatePanel
        icon={ShieldAlert}
        title="Access restricted"
        description="Your current role does not permit access to this area."
        action={
          <Button as={Link} to={user.role === 'IT_SECURITY_ADMIN' ? '/admin' : '/'}>
            Return to your workspace
          </Button>
        }
      />
    </Card>
  );
}
