import { Link } from 'react-router';
import { AlertCircle, BookOpenCheck, Clock, GraduationCap, Layers, Lightbulb, ListChecks, Mail, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Badge, Button, Card, LoadingPanel, StatePanel } from '../../components/ui/index.jsx';
import { label } from './training-model.js';
import { lessonBlocks } from './lesson-blocks.js';

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
const callouts = {
  takeaway: { icon: ShieldCheck, box: 'border-success-200 bg-success-50', heading: 'text-success-800' },
  example: { icon: Mail, box: 'border-slate-200 bg-slate-50', heading: 'text-slate-700' },
  warning: { icon: TriangleAlert, box: 'border-warning-200 bg-warning-50', heading: 'text-warning-900' },
  tip: { icon: Lightbulb, box: 'border-brand-200 bg-brand-50', heading: 'text-brand-800' },
};
function LessonBlocks({ blocks }) {
  return blocks.map((block, index) => {
    if (block.type === 'paragraph') return <p key={index} className="break-words">{block.lines.map((line, position) => <span key={position} className="block">{line}</span>)}</p>;
    if (block.type === 'callout') {
      const style = callouts[block.variant]; const Icon = style.icon;
      return <aside key={index} aria-label={block.title ? `${block.label}: ${block.title}` : block.label} className={`rounded-xl border p-4 sm:p-5 ${style.box}`}><p className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${style.heading}`}><Icon className="size-4 shrink-0" aria-hidden="true" />{block.label}</p>{block.title && <p className="mt-2 font-bold text-slate-900">{block.title}</p>}<div className="mt-2 space-y-3 text-[0.95rem] leading-7"><LessonBlocks blocks={block.blocks} /></div></aside>;
    }
    const List = block.type === 'steps' ? 'ol' : 'ul';
    return <div key={index}>{block.lead && <p className="font-semibold text-slate-900">{block.lead}</p>}<List className={`mt-2 space-y-2 pl-5 ${block.type === 'steps' ? 'list-decimal' : 'list-disc marker:text-brand-600'}`}>{block.items.map((item, position) => <li key={position} className="break-words pl-1">{item}</li>)}</List></div>;
  });
}
export function LessonBody({ body }) {
  return <div className="space-y-5 text-[0.97rem] leading-8 text-slate-700"><LessonBlocks blocks={lessonBlocks(body)} /></div>;
}
export function CourseContent({ course, activeIndex = null }) {
  const sections = course.content?.sections ?? [];
  const shown = activeIndex === null ? sections : sections.slice(activeIndex, activeIndex + 1);
  const overview = activeIndex === null || activeIndex === 0;
  const facts = [[Layers, `${sections.length} ${sections.length === 1 ? 'section' : 'sections'}`], [Clock, `About ${course.estimatedMinutes} minutes`],
    [ListChecks, course.requiresQuiz ? 'Final quiz required' : 'No quiz required']];
  return <div className="space-y-6">{overview && <Card className="p-5 sm:p-7"><BookOpenCheck className="size-6 text-brand-700" aria-hidden="true" /><h2 className="mt-3 text-lg font-bold">What you will learn</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-600">{course.description}</p><ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-700">{course.learningObjectives?.map((objective, index) => <li key={index}>{objective}</li>)}</ul><ul aria-label="Course details" className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5">{facts.map(([Icon, text]) => <li key={text} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"><Icon className="size-3.5" aria-hidden="true" />{text}</li>)}</ul></Card>}{shown.map((section) => <Card key={section.key} className="p-5 sm:p-8"><p className="ui-section-label">Section {sections.indexOf(section) + 1} of {sections.length}</p><h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">{section.title}</h2><div className="mt-5"><LessonBody body={section.body} /></div></Card>)}</div>;
}
export function BackLink({ to, children }) { return <Button as={Link} to={to} variant="ghost" className="mb-4">← {children}</Button>; }
