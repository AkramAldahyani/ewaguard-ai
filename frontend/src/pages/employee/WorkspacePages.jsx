import { ShieldCheck, UserRound } from 'lucide-react';
import { Card } from '../../components/ui/index.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAuth } from '../../context/auth-context.js';

export function ProfilePage() {
  const { user } = useAuth();
  const details = [['Full name', `${user.firstName} ${user.lastName}`], ['Email address', user.email], ['Employee identifier', user.employeeIdentifier ?? 'Not provided'], ['Department', user.department?.name ?? 'Not assigned'], ['Role', user.role === 'EMPLOYEE' ? 'Employee' : 'IT / Security Administrator']];
  return <><PageHeader eyebrow="Your account" title="Profile" description="Your organization-provided account details from your authenticated session." breadcrumbs={['Profile']} />
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(16rem,1fr)]"><Card className="overflow-hidden"><div className="flex items-center gap-4 border-b border-slate-100 bg-brand-50/40 p-6"><span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white text-brand-700 ring-1 ring-brand-200"><UserRound className="size-7" aria-hidden="true" /></span><div className="min-w-0"><h2 className="break-words text-xl font-bold">{user.firstName} {user.lastName}</h2><p className="mt-1 text-sm text-slate-600">Organization account</p></div></div><dl className="divide-y divide-slate-100 px-6">{details.map(([label, value]) => <div key={label} className="grid gap-2 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]"><dt className="text-sm font-medium text-slate-500">{label}</dt><dd className="break-words text-sm font-semibold text-slate-800">{value}</dd></div>)}</dl></Card>
      <Card className="p-6"><ShieldCheck className="size-6 text-brand-700" aria-hidden="true" /><h2 className="mt-4 font-bold">Managed by your organization</h2><p className="mt-2 text-sm leading-6 text-slate-600">Contact your IT/security administrator if these details need to change. Profile editing is not available here.</p><p className="mt-4 text-sm leading-6 text-slate-600">This page displays only your safe session profile. Authentication secrets and internal identifiers are not shown.</p></Card></div>
  </>;
}
