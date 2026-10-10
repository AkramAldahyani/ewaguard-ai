import { Award } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { Badge, Button, Card, StatePanel } from '../../components/ui/index.jsx';
import { FeatureOutline, PreviewPage } from '../../components/employee/PortalPreview.jsx';

function AwarenessNavigation() {
  return <nav aria-label="Security awareness" className="mb-6 flex flex-wrap gap-2">{[['/training', 'My Training'], ['/monthly-quiz', 'Monthly Quiz'], ['/certificates', 'Certificates']].map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => `rounded-xl border px-4 py-2.5 text-sm font-semibold ${isActive ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300'}`}>{label}</NavLink>)}</nav>;
}

export function CertificatesPage() {
  return <PreviewPage section="Security awareness" title="Certificates" description="Your record of qualifying security-awareness learning, together in one place.">
    <AwarenessNavigation /><div className="grid gap-6 lg:grid-cols-2"><Card className="p-6"><StatePanel icon={Award} title="Certificate records are not connected" description="Earned certificates will appear after qualifying training is completed. This preview has not issued any certificate." action={<Button as={Link} to="/training" variant="secondary">Explore My Training</Button>} /></Card>
      <Card className="p-6"><div className="rounded-xl border border-brand-200 bg-brand-50/30 p-6 text-center sm:p-9"><Badge>Layout preview · Not a certificate</Badge><Award className="mx-auto mt-6 size-12 text-brand-700" aria-hidden="true" /><h2 className="mt-4 text-xl font-bold text-navy-900">Learning achievement</h2><p className="mt-3 text-sm leading-6 text-slate-600">Course title, completion date, score, and unique certificate reference will appear on an earned certificate.</p><div className="mx-auto my-6 h-px max-w-48 bg-brand-200" /><Button disabled variant="secondary">Download PDF — coming later</Button></div></Card></div>
  </PreviewPage>;
}
