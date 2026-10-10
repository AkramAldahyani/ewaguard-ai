import { AlertCircle, CalendarDays } from 'lucide-react';
import { Button, Card, StatePanel } from '../../components/ui/index.jsx';

export function MonthlyFeedback({ loading, error, retry, empty, emptyTitle = 'No monthly quizzes found', emptyDescription = 'No records are available yet.' }) {
  if (loading) return <Card className="p-5 sm:p-6"><div role="status" className="animate-pulse space-y-3"><span className="block h-5 w-44 rounded bg-slate-200" /><span className="block h-20 rounded-xl bg-slate-100" />Loading monthly quizzes…</div></Card>;
  if (error) return <Card className="p-5 sm:p-6"><StatePanel icon={AlertCircle} tone="error" title="Monthly quizzes could not be loaded" description={error} action={retry && <Button variant="secondary" onClick={retry}>Try again</Button>} /></Card>;
  if (empty) return <Card className="p-5 sm:p-6"><StatePanel icon={CalendarDays} title={emptyTitle} description={emptyDescription} /></Card>;
  return null;
}
