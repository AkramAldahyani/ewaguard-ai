import { AlertCircle, CalendarDays } from 'lucide-react';
import { Button, Card, LoadingPanel, StatePanel } from '../../components/ui/index.jsx';

export function MonthlyFeedback({ loading, error, retry, empty, emptyTitle = 'No monthly quizzes found', emptyDescription = 'No records are available yet.' }) {
  if (loading) return <LoadingPanel label="Loading monthly quizzes…" />;
  if (error) return <Card className="p-5 sm:p-6"><StatePanel icon={AlertCircle} tone="error" title="Monthly quizzes could not be loaded" description={error} action={retry && <Button variant="secondary" onClick={retry}>Try again</Button>} /></Card>;
  if (empty) return <Card className="p-5 sm:p-6"><StatePanel icon={CalendarDays} title={emptyTitle} description={emptyDescription} /></Card>;
  return null;
}
