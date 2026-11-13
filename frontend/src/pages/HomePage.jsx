import { ArrowRight, Award, BookOpenCheck, CalendarDays, KeyRound, Link2, Mail, MessageSquareText, ShieldAlert, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import building from '../assets/branding/ewa_building-wide.png';
import analyzeFileImage from '../assets/illustrations/analyze_file.png';
import analyzeMailImage from '../assets/illustrations/analyze_mail.png';
import analyzeUrlImage from '../assets/illustrations/analyze_url.png';
import certificatesImage from '../assets/illustrations/certificates.png';
import monthlyQuizImage from '../assets/illustrations/monthly_quiz.png';
import myIncidentsImage from '../assets/illustrations/my_incedents.png';
import myTrainingImage from '../assets/illustrations/my_training.png';
import passwordSecurityImage from '../assets/illustrations/password_security.png';
import securityCommunityImage from '../assets/illustrations/security_community.png';
import { Badge, Button, Card } from '../components/ui/index.jsx';
import { PortalLinkCard } from '../components/employee/PortalPreview.jsx';
import { SecurityTips } from '../components/employee/SecurityTips.jsx';
import { useAuth } from '../context/auth-context.js';

const tools = [
  { title: 'Analyze Email', icon: Mail, image: analyzeMailImage, to: '/analyze/email', description: 'Review suspicious messages, headers, and .eml files.' },
  { title: 'Analyze URL', icon: Link2, image: analyzeUrlImage, to: '/analyze/url', description: 'Review link structure, DNS, certificates, and reputation evidence.' },
  { title: 'Analyze File', icon: Upload, image: analyzeFileImage, to: '/analyze/file', description: 'Review file validation, local scans, and hash reputation.' },
  { title: 'Password Security', icon: KeyRound, image: passwordSecurityImage, to: '/password-security', description: 'Check strength locally and create a policy-compliant password.' },
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
      <div className="relative max-w-3xl px-6 py-9 sm:px-9 sm:py-10"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cyan-200"><ShieldCheck className="size-5" aria-hidden="true" />Your security companion</div><h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Make your next security<br className="hidden sm:block" /> decision with confidence.</h2><SecurityTips /><div className="mt-6 flex flex-wrap gap-3"><Button as={Link} to="/assistant" size="lg"><Sparkles className="size-4" aria-hidden="true" />Ask EWAGuard AI<ArrowRight className="size-4" aria-hidden="true" /></Button><Button as={Link} to="/training" variant="secondary" size="lg">Explore My Training</Button></div></div>
    </Card>

    <section className="mt-8" aria-labelledby="tools-heading"><div className="mb-4"><p className="ui-section-label">Quick access</p><h2 id="tools-heading" className="mt-1 text-xl font-bold">Review a security concern</h2></div><div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">{tools.map((tool) => <PortalLinkCard key={tool.to} {...tool} compactImage />)}</div></section>

    <section className="mt-8" aria-labelledby="awareness-heading"><div className="mb-4"><p className="ui-section-label">Build stronger habits</p><h2 id="awareness-heading" className="mt-1 text-xl font-bold">Security Awareness</h2></div><div className="grid gap-4 md:grid-cols-3"><PortalLinkCard icon={BookOpenCheck} image={myTrainingImage} compactImage title="My Training" to="/training" description="Open assigned courses, work through their sections, and follow your saved progress." /><PortalLinkCard icon={CalendarDays} image={monthlyQuizImage} compactImage title="Monthly Quiz" to="/monthly-quiz" description="Open published monthly quizzes and review your historical results." /><PortalLinkCard icon={Award} image={certificatesImage} compactImage title="Certificates" to="/certificates" description="View and download certificates earned from qualifying course completion." /></div></section>

    <section className="mt-8 grid gap-4 lg:grid-cols-2" aria-label="Reports and shared awareness"><PortalLinkCard icon={ShieldAlert} image={myIncidentsImage} compactImage title="My Incidents" to="/incidents" description="Track your security reports, review their status and follow updates shared by the security team." /><PortalLinkCard icon={MessageSquareText} image={securityCommunityImage} coverImage title="Security Community" to="/community" description="Read approved security tips and warnings, or submit a post for administrator review." /></section>

    <aside className="my-6 flex items-start gap-4 rounded-2xl border border-brand-200 bg-white p-5 sm:p-6"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><ShieldCheck className="size-5" aria-hidden="true" /></span><div><h2 className="font-bold text-slate-950">Pause before you act</h2><p className="mt-1 text-sm leading-6 text-slate-600">Unexpected request for a password or payment? Verify it through a known, approved channel before responding. For an urgent concern, use your organization’s IT/security reporting process.</p></div></aside>
  </>;
}
