import { Link, useNavigate } from 'react-router';
import { Compass } from 'lucide-react';
import { Button, Card, StatePanel } from '../components/ui/index.jsx';
import { useAuth } from '../context/auth-context.js';

export function NotFoundPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const home = user.role === 'IT_SECURITY_ADMIN' ? '/admin' : '/';
  return (
    <Card className="p-6">
      <StatePanel
        icon={Compass}
        title="Page not found"
        description="This page does not exist or may have moved. Check the address, or return to your workspace."
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button as={Link} to={home}>
              Return to your workspace
            </Button>
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Go back
            </Button>
          </div>
        }
      />
    </Card>
  );
}
