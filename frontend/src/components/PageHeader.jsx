import { ChevronRight } from 'lucide-react';
import { useContext } from 'react';
import { Link, useLocation } from 'react-router';
import { cn } from '../lib/cn.js';
import { AuthContext } from '../context/auth-context.js';

export function PageHeader({ eyebrow, title, description, actions, breadcrumbs = [], className }) {
  const { pathname } = useLocation();
  const session = useContext(AuthContext);
  const admin = session?.user?.role === 'IT_SECURITY_ADMIN' || pathname.startsWith('/admin');
  return (
    <header className={cn('ui-page-header', className)}>
      {breadcrumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="mb-4 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-600"
        >
          <Link
            to={admin ? '/admin' : '/'}
            className="inline-flex min-h-9 items-center rounded-md px-1 hover:text-brand-700"
          >
            {admin ? 'Dashboard' : 'Home'}
          </Link>
          {breadcrumbs.map((item, index) => (
            <span key={`${index}-${item}`} className="flex min-w-0 items-center gap-1.5">
              <ChevronRight className="size-3.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} className="text-slate-700">
                {item}
              </span>
            </span>
          ))}
        </nav>
      )}
      <div className="ui-page-heading">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="ui-section-label mb-2">{eyebrow}</p>}
          <h1 className="ui-page-title">{title}</h1>
          {description && (
            <p className="mt-2.5 max-w-3xl text-sm leading-6 text-slate-600 sm:text-[0.95rem]">{description}</p>
          )}
        </div>
        {actions && <div className="ui-page-actions">{actions}</div>}
      </div>
    </header>
  );
}
