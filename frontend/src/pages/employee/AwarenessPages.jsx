import { Award, BookOpenCheck, CalendarDays, CheckCircle2, GraduationCap } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { Badge, Button, Card, StatePanel } from '../../components/ui/index.jsx';
import { FeatureOutline, PreviewPage } from '../../components/employee/PortalPreview.jsx';

function AwarenessNavigation() {
  return <nav aria-label="Security awareness" className="mb-6 flex flex-wrap gap-2">{[['/training', 'My Training'], ['/monthly-quiz', 'Monthly Quiz'], ['/certificates', 'Certificates']].map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => `rounded-xl border px-4 py-2.5 text-sm font-semibold ${isActive ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'}`}>{label}</NavLink>)}</nav>;
}

export function TrainingPage() {
  return <PreviewPage section="Security awareness" title="My Training" description="Short, practical learning that connects everyday decisions to better cybersecurity habits.">
    <AwarenessNavigation />
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(16rem,1fr)]">
      <Card className="overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-slate-100 p-6"><h2 className="text-lg font-bold">Assigned learning</h2><Badge>Not connected</Badge></div>
        <div className="p-5 sm:p-6"><StatePanel icon={GraduationCap} title="Your learning journey will start here" description="Assigned training data is not connected yet. This does not indicate whether you have outstanding organizational training." /></div>
        <div className="mx-6 mb-6 rounded-xl border border-slate-200 p-5"><div className="flex items-center gap-3"><BookOpenCheck className="size-5 text-brand-700" aria-hidden="true" /><h3 className="font-semibold">Course card preview</h3></div><p className="mt-3 text-sm leading-6 text-slate-600">Future course cards will show the topic, estimated duration, and your next learning step.</p><p className="mt-3 text-xs text-slate-500">Course title and duration are not available.</p><Button disabled variant="secondary" className="mt-4">Start course — coming later</Button></div>
      </Card>
      <div className="space-y-6"><Card className="p-6"><div className="flex items-center gap-3"><CheckCircle2 className="size-5 text-brand-700" aria-hidden="true" /><h2 className="font-bold">Your progress</h2></div><p className="mt-5 text-2xl font-bold text-slate-700">Not available</p><div className="mt-4 h-2 rounded-full bg-slate-100" aria-hidden="true" /><p className="mt-3 text-sm leading-6 text-slate-600">Progress will reflect completed material and required quiz results. Opening a course will not complete it.</p></Card><FeatureOutline title="Learn, practise, demonstrate" items={['Work through short, practical sections.', 'Test your understanding with a course quiz.', 'Earn a certificate after meeting the course requirements.']} /></div>
    </div>
  </PreviewPage>;
}

export function MonthlyQuizPage() {
  return <PreviewPage section="Security awareness" title="Monthly Quiz" description="A regular opportunity to revisit security topics and put your understanding into practice.">
    <AwarenessNavigation /><div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(16rem,1fr)]"><Card className="p-6"><StatePanel icon={CalendarDays} title="Monthly quizzes are coming later" description="No published quiz or participation data is connected. Monthly quizzes will be separate from course assessments." action={<Button disabled>Start monthly quiz</Button>} /><div className="mt-6 border-t border-slate-100 pt-5"><h2 className="font-bold">Your quiz history</h2><p className="mt-2 text-sm leading-6 text-slate-600">Completed attempts, results, and historical scores will appear here. No scores have been loaded.</p></div></Card><FeatureOutline title="What you can expect" items={['Administrator-reviewed questions on approved awareness topics.', 'Clear results and explanations when a quiz is completed.', 'Historical scores shown objectively, without assumed improvement.']} /></div>
  </PreviewPage>;
}

export function CertificatesPage() {
  return <PreviewPage section="Security awareness" title="Certificates" description="Your record of qualifying security-awareness learning, together in one place.">
    <AwarenessNavigation /><div className="grid gap-6 lg:grid-cols-2"><Card className="p-6"><StatePanel icon={Award} title="Certificate records are not connected" description="Earned certificates will appear after qualifying training is completed. This preview has not issued any certificate." action={<Button as={Link} to="/training" variant="secondary">Explore My Training</Button>} /></Card>
      <Card className="p-6"><div className="rounded-xl border border-brand-200 bg-brand-50/30 p-6 text-center sm:p-9"><Badge>Layout preview · Not a certificate</Badge><Award className="mx-auto mt-6 size-12 text-brand-700" aria-hidden="true" /><h2 className="mt-4 text-xl font-bold text-navy-900">Learning achievement</h2><p className="mt-3 text-sm leading-6 text-slate-600">Course title, completion date, score, and unique certificate reference will appear on an earned certificate.</p><div className="mx-auto my-6 h-px max-w-48 bg-brand-200" /><Button disabled variant="secondary">Download PDF — coming later</Button></div></Card></div>
  </PreviewPage>;
}
