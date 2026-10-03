import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

export function PageHeader({ eyebrow, title, description, actions, breadcrumbs = [] }) {
  return <header className="mb-8">{breadcrumbs.length > 0 && <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500"><Link to="/" className="rounded-md px-1 py-0.5 hover:text-brand-700">Home</Link>{breadcrumbs.map((item) => <span key={item} className="flex items-center gap-1.5"><ChevronRight className="size-3.5 text-slate-300" aria-hidden="true" /><span aria-current="page" className="text-slate-700">{item}</span></span>)}</nav>}<div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-[0.68rem] font-extrabold uppercase tracking-[0.18em] text-brand-700">{eyebrow}</p><h1 className="text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-[2.15rem] sm:leading-tight">{title}</h1>{description && <p className="mt-2.5 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[0.95rem]">{description}</p>}</div>{actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}</div></header>;
}
