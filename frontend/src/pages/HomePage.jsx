import { ArrowRight, Award, BookOpenCheck, CalendarDays, KeyRound, Link2, Mail, MessageSquareText, ShieldAlert, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import building from '../assets/branding/ewa_building-wide.png';
import { Badge, Button, Card } from '../components/ui/index.jsx';
import { PortalLinkCard, PreviewNotice } from '../components/employee/PortalPreview.jsx';
import { useAuth } from '../context/auth-context.js';

const tools = [
  { title: 'Analyze Email', icon: Mail, to: '/analyze/email', description: 'Review suspicious messages, headers, and .eml files.' },
  { title: 'Analyze URL', icon: Link2, to: '/analyze/url', description: 'Review link structure, DNS, certificates, and reputation evidence.' },
  { title: 'Analyze File', icon: Upload, to: '/analyze/file', description: 'Preview permitted file checks and their limitations.' },
  { title: 'Password Security', icon: KeyRound, to: '/password-security', description: 'Check strength locally and create a policy-compliant password.' },
];

export function HomePage() {
  const { user } = useAuth();
  const [apiState, setApiState] = useState('checking');
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    fetch('/api/health', { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { if (active) setApiState(data.status === 'ok' ? 'online' : 'offline'); })
      .catch(() => { if (active) setApiState('offline'); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, []);

  return <>
    <header className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="min-w-0"><p className="ui-section-label">Employee workspace</p><h1 className="mt-2 break-words text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Welcome, {user.firstName}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{user.department?.name ?? 'Department not assigned'} <span aria-hidden="true">·</span> Your security tools, learning, and guidance in one place.</p></div><div role="status" className="shrink-0"><Badge tone={apiState === 'online' ? 'success' : apiState === 'offline' ? 'warning' : 'neutral'}>{apiState === 'checking' ? 'Checking API connection' : apiState === 'online' ? 'API connected' : 'API unavailable'}</Badge></div></header>

    <Card className="relative isolate overflow-hidden border-0 bg-navy-950 text-white">
      <img src={building} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
      <div className="absolute inset-0 bg-gradient-to-r from-navy-950/95 via-navy-950/90 to-navy-950/50" aria-hidden="true" />
      <div className="relative max-w-3xl px-6 py-9 sm:px-9 sm:py-10"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-200"><ShieldCheck className="size-5" aria-hidden="true" />Your security companion</div><h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Make your next security<br className="hidden sm:block" /> decision with confidence.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-slate-200">Explore your new workspace for cybersecurity assistance, threat analysis, and practical awareness learning.</p><div className="mt-6 flex flex-wrap gap-3"><Button as={Link} to="/assistant" size="lg"><Sparkles className="size-4" aria-hidden="true" />Ask EWAGuard AI<ArrowRight className="size-4" aria-hidden="true" /></Button><Button as={Link} to="/training" variant="secondary" size="lg">Explore My Training</Button></div><p className="mt-4 text-xs font-medium text-slate-300">Assistant and learning features are currently previews.</p></div>
    </Card>

    <section className="mt-8" aria-labelledby="tools-heading"><div className="mb-4"><p className="ui-section-label">Quick access</p><h2 id="tools-heading" className="mt-1 text-xl font-bold">Review a security concern</h2></div><div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">{tools.map((tool) => <PortalLinkCard key={tool.to} {...tool} />)}</div></section>

    <section className="mt-8" aria-labelledby="awareness-heading"><div className="mb-4"><p className="ui-section-label">Build stronger habits</p><h2 id="awareness-heading" className="mt-1 text-xl font-bold">Security Awareness</h2></div><div className="grid gap-4 md:grid-cols-3"><PortalLinkCard icon={BookOpenCheck} title="My Training" to="/training" description="Assigned courses and progress will appear when training is connected." /><PortalLinkCard icon={CalendarDays} title="Monthly Quiz" to="/monthly-quiz" description="Published quizzes and your historical results will be available here." /><PortalLinkCard icon={Award} title="Certificates" to="/certificates" description="Your earned certificates will appear after qualifying course completion." /></div></section>

    <section className="mt-8 grid gap-4 lg:grid-cols-2" aria-label="Reports and shared awareness"><PortalLinkCard icon={ShieldAlert} title="My Incidents" to="/incidents" description="No live incident data connected yet. Preview the space for your authorized reports and updates." /><PortalLinkCard icon={MessageSquareText} title="Security Community" to="/community" description="Approved posts are not connected yet. Preview a community where every submission is reviewed." /></section>

    <aside className="my-6 flex items-start gap-4 rounded-2xl border border-brand-200 bg-white p-5 sm:p-6"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><ShieldCheck className="size-5" aria-hidden="true" /></span><div><h2 className="font-bold text-slate-950">Pause before you act</h2><p className="mt-1 text-sm leading-6 text-slate-600">Unexpected request for a password or payment? Verify it through a known, approved channel before responding. For an urgent concern, use your organization’s IT/security reporting process.</p></div></aside>
    <PreviewNotice>Email analysis and local password tools are available. URL/file analysis, incidents, awareness records, and community content remain previews. Your name and department come from your authenticated session.</PreviewNotice>
  </>;
}
