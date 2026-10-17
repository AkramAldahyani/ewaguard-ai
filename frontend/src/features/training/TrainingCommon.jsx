import { Link } from 'react-router';
import { AlertCircle, BookOpenCheck, GraduationCap } from 'lucide-react';
import { Badge, Button, Card, LoadingPanel, StatePanel } from '../../components/ui/index.jsx';
import { label } from './training-model.js';

export function TrainingBadge({ status }) {
  const tone = status === 'COMPLETED' || status === 'PUBLISHED' ? 'success' : status === 'ARCHIVED' ? 'neutral' : status === 'IN_PROGRESS' ? 'brand' : 'warning';
  return <Badge tone={tone}>{label(status)}</Badge>;
}
export function TrainingFeedback({ loading, error, retry, empty, emptyTitle = 'No training records found', emptyDescription = 'There are no matching training records yet.' }) {
  if (loading) return <LoadingPanel label="Loading training…" />;
  if (error) return <Card className="p-5 sm:p-6"><StatePanel icon={AlertCircle} tone="error" title="Training could not be loaded" description={error} action={retry && <Button variant="secondary" onClick={retry}>Try again</Button>} /></Card>;
  if (empty) return <Card className="p-5 sm:p-6"><StatePanel icon={GraduationCap} title={emptyTitle} description={emptyDescription} /></Card>;
  return null;
}
export function TrainingPager({ result, onChange, disabled = false, ariaLabel = 'Training pages' }) {
  if (!result) return null;
  return <nav aria-label={ariaLabel} className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4"><span className="text-sm text-slate-500">Page {result.page}</span><div className="flex gap-2"><Button variant="secondary" size="sm" disabled={disabled || result.page <= 1} onClick={() => onChange(result.page - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={disabled || !result.hasMore} onClick={() => onChange(result.page + 1)}>Next</Button></div></nav>;
}
export function ProgressBar({ progress }) {
  const percent = Math.max(0, Math.min(100, progress?.progressPercent ?? 0));
  return <div><div className="mb-2 flex justify-between gap-3 text-xs font-semibold text-slate-600"><span>Material progress</span><span>{percent}%</span></div><div role="progressbar" aria-label="Course material progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div style={{ width: `${percent}%` }} className="h-full rounded-full bg-brand-600 transition-[width]" /></div></div>;
}
export function CourseContent({ course, activeIndex = null }) {
  const sections = course.content?.sections ?? [];
  const shown = activeIndex === null ? sections : sections.slice(activeIndex, activeIndex + 1);
  return <div className="space-y-6"><Card className="p-5 sm:p-7"><BookOpenCheck className="size-6 text-brand-700" aria-hidden="true" /><h2 className="mt-3 text-lg font-bold">What you will learn</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{course.description}</p><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{course.learningObjectives?.map((objective, index) => <li key={index}>{objective}</li>)}</ul></Card>{shown.map((section) => <Card key={section.key} className="p-5 sm:p-8"><p className="ui-section-label">Section {sections.indexOf(section) + 1} of {sections.length}</p><h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">{section.title}</h2><p className="mt-5 whitespace-pre-wrap break-words text-[0.97rem] leading-8 text-slate-700">{section.body}</p></Card>)}</div>;
}
export function BackLink({ to, children }) { return <Button as={Link} to={to} variant="ghost" className="mb-4">← {children}</Button>; }
