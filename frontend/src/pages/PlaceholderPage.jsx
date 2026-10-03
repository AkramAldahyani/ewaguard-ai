import { Construction } from 'lucide-react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/PageHeader.jsx';
import { Button, Card, StatePanel } from '../components/ui/index.jsx';

export function PlaceholderPage({ title, description = 'This workspace is prepared for a later development phase.' }) {
  const navigate = useNavigate();
  return <><PageHeader eyebrow="Application shell" title={title} description={description} breadcrumbs={[title]} /><Card className="p-5 sm:p-7"><StatePanel icon={Construction} title={`${title} is coming in a later phase`} description="The navigation route and responsive shell are ready. No business logic, data, or simulated security result has been added." action={<Button variant="secondary" onClick={() => navigate(-1)}>Return to previous page</Button>} /></Card></>;
}
