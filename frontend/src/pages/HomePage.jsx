import {
  ArrowRight, BookOpenCheck, CheckCircle2, Clock3, FileSearch, GraduationCap,
  Info, LockKeyhole, ShieldCheck, Sparkles, TriangleAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import building from '../assets/branding/ewa_building-wide.png';
import analyzeConcern from '../assets/illustrations/analyze-a-concern.png';
import askEwaguard from '../assets/illustrations/ask-ewaguard-ai.png';
import continueLearning from '../assets/illustrations/continue-learning.png';
import { Badge, Button, Card } from '../components/ui/index.jsx';
import { useAuth } from '../context/auth-context.js';

const quickActions = [
  {
    icon: Sparkles,
    image: askEwaguard,
    imageAlt: 'AI security shield coordinating trusted guidance and verified security signals',
    title: 'Ask EWAGuard AI',
    description: 'Get clear cybersecurity guidance and coordinated next steps.',
    to: '/assistant',
  },
  {
    icon: FileSearch,
    image: analyzeConcern,
    imageAlt: 'Email, URL, and file passing through a structured security analysis workflow',
    title: 'Analyze a concern',
    description: 'Prepare an email, suspicious link, or permitted file for review.',
    to: '/analyze/email',
  },
  {
    icon: BookOpenCheck,
    image: continueLearning,
    imageAlt: 'Security-awareness learning modules progressing toward an achievement',
    title: 'Continue learning',
    description: 'Build practical awareness with short assigned learning activities.',
    to: '/training',
  },
];

function PreviewLabel() {
  return <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-slate-500">Preview</span>;
}

export function HomePage() {
  const [apiState, setApiState] = useState('checking');
  const { user } = useAuth();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    fetch('/api/health', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => setApiState(data.status === 'ok' ? 'online' : 'offline'))
      .catch(() => setApiState('offline'))
      .finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, []);

  return (
    <>
      <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-brand-700">Employee security workspace</p>
          <h1 className="text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-[2.25rem] sm:leading-tight">Welcome, {user.firstName}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-[0.95rem]">Stay informed, analyze concerns, and build stronger security habits.</p>
        </div>
        <Badge tone={apiState === 'online' ? 'success' : apiState === 'offline' ? 'danger' : 'neutral'} className="w-fit">
          <span className="size-1.5 rounded-full bg-current" />
          {apiState === 'checking' ? 'Checking service' : apiState === 'online' ? 'Foundation API connected' : 'Foundation API unavailable'}
        </Badge>
      </header>

      <Card className="relative isolate min-h-[25rem] overflow-hidden border-0 bg-navy-950 text-white shadow-float sm:min-h-[28rem]">
        <img src={building} alt="Wide view of the Electricity and Water Authority headquarters in Bahrain" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy-950/95 via-navy-950/82 to-navy-950/28" />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-950/35 via-transparent to-navy-950/15" />
        <div className="brand-grid absolute inset-0 opacity-35" aria-hidden="true" />
        <div className="relative z-10 flex min-h-[25rem] max-w-3xl flex-col justify-center px-6 py-10 sm:min-h-[28rem] sm:px-10 lg:px-12">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/10 text-cyan-200 shadow-sm backdrop-blur"><ShieldCheck className="size-5" /></span>
            <span className="text-xs font-extrabold uppercase tracking-[0.17em] text-cyan-100">Your security companion</span>
          </div>
          <h2 className="max-w-2xl text-3xl font-bold tracking-[-0.035em] text-white [text-shadow:0_2px_18px_rgb(0_0_0/0.35)] sm:text-[2.65rem] sm:leading-[1.08]">Confident security decisions start with the right guidance.</h2>
          <p className="mt-4 max-w-xl text-sm font-medium leading-7 text-slate-100 [text-shadow:0_1px_10px_rgb(0_0_0/0.45)] sm:text-base">Describe a concern, understand the available evidence, and receive clear next steps through one trusted employee workspace.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button as={Link} to="/assistant" size="lg">Ask EWAGuard AI <ArrowRight className="size-4" /></Button>
            <Button as={Link} to="/analyze/email" variant="secondary" size="lg">Analyze a concern</Button>
          </div>
          <div className="mt-7 flex w-fit items-center gap-2 rounded-lg border border-white/15 bg-navy-950/55 px-3 py-2 text-[0.7rem] font-semibold text-slate-200 backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-cyan-300" />Electricity &amp; Water Authority employee workspace
          </div>
        </div>
      </Card>

      <section className="mt-8" aria-labelledby="quick-tools-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-brand-700">Quick access</p><h2 id="quick-tools-heading" className="mt-1.5 text-xl font-bold tracking-tight text-slate-950">Start with what you need</h2></div>
          <p className="hidden text-xs font-medium text-slate-500 sm:block">Employee tools · Interface preview</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {quickActions.map(({ icon: Icon, image, imageAlt, title, description, to }) => (
            <Link to={to} key={title} className="group rounded-2xl focus:outline-none">
              <Card className="h-full overflow-hidden transition duration-200 group-hover:-translate-y-1 group-hover:border-brand-200 group-hover:shadow-float">
                <div className="relative aspect-[2/1] overflow-hidden bg-navy-950">
                  <img src={image} alt={imageAlt} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-navy-950/45 via-transparent to-transparent" />
                  <span className="absolute bottom-3 left-3 grid size-10 place-items-center rounded-xl border border-white/20 bg-navy-950/80 text-cyan-200 shadow-lg backdrop-blur"><Icon className="size-5" /></span>
                </div>
                <div className="p-5"><div className="flex items-start justify-between gap-3"><h3 className="font-bold text-slate-950">{title}</h3><ArrowRight className="mt-0.5 size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" /></div><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p></div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-5 xl:grid-cols-[1.45fr_0.75fr]" aria-label="Security overview preview">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6"><div><p className="text-[0.65rem] font-extrabold uppercase tracking-[0.16em] text-brand-700">Security overview</p><h2 className="mt-1 text-lg font-bold text-slate-950">Your workspace at a glance</h2></div><PreviewLabel /></div>
          <div className="grid sm:grid-cols-2">
            <div className="border-b border-slate-100 p-5 sm:border-b-0 sm:border-r sm:p-6">
              <div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-success-50 text-success-700 ring-1 ring-success-200"><LockKeyhole className="size-5" /></span><div><p className="text-sm font-bold text-slate-900">Workspace status</p><p className="mt-1 text-sm leading-6 text-slate-500">No live security data is connected in this phase.</p><span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-success-700"><CheckCircle2 className="size-3.5" />Foundation available</span></div></div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"><ShieldCheck className="size-5" /></span><div><p className="text-sm font-bold text-slate-900">My incidents</p><p className="mt-1 text-sm leading-6 text-slate-500">Incident records will appear after the incident phases.</p><Button as={Link} to="/incidents" variant="ghost" size="sm" className="mt-2 -ml-3">View prepared page <ArrowRight className="size-3.5" /></Button></div></div>
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/65 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3"><Clock3 className="size-4 text-slate-400" /><p className="text-xs text-slate-500"><strong className="font-semibold text-slate-700">Recent activity:</strong> No employee activity is recorded in this interface preview.</p></div>
          </div>
        </Card>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
          <Card className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"><GraduationCap className="size-5" /></span><PreviewLabel /></div>
            <h2 className="mt-5 text-base font-bold text-slate-950">Awareness progress</h2>
            <div className="mt-4 flex items-end justify-between"><p className="text-2xl font-bold tracking-tight text-navy-900">68%</p><p className="text-[0.68rem] font-semibold text-slate-500">Representative only</p></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-[68%] rounded-full bg-gradient-to-r from-brand-600 to-cyan-400" /></div>
            <p className="mt-3 text-xs leading-5 text-slate-500">Sample progress demonstrates how assigned training will appear.</p>
          </Card>
          <Card className="border-warning-200/80 bg-gradient-to-br from-white to-warning-50/55 p-5 sm:p-6">
            <div className="flex gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warning-50 text-warning-800 ring-1 ring-warning-200"><TriangleAlert className="size-[1.1rem]" /></span><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-bold text-slate-950">Security notice example</h2><PreviewLabel /></div><p className="mt-2 text-xs leading-5 text-slate-600">Be cautious with unexpected password-reset messages. Verify the sender and use official channels.</p></div></div>
          </Card>
        </div>
      </section>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3.5 text-sm text-brand-900"><Info className="mt-0.5 size-4 shrink-0 text-brand-600" /><p className="leading-6">Dashboard values and notices marked <strong>Preview</strong> are representative interface content. They are not security findings or employee records.</p></div>
    </>
  );
}
