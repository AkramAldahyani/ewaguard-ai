import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '../ui/index.jsx';

export function PortalLinkCard({
  icon: Icon,
  image,
  compactImage = false,
  coverImage = false,
  title,
  description,
  to,
}) {
  return (
    <Link to={to} className="portal-link group block h-full rounded-2xl">
      <Card className="h-full overflow-hidden transition-colors group-hover:border-brand-300">
        {image && (
          <div className="border-b border-slate-100 bg-white">
            <img
              src={image}
              alt=""
              loading="lazy"
              className={`block w-full ${coverImage ? 'h-40 object-cover object-center' : compactImage ? 'h-40 object-contain' : 'aspect-[3/2] object-contain'}`}
            />
          </div>
        )}
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Icon className="size-5" aria-hidden="true" />
            </span>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <h3 className="font-bold text-slate-950">{title}</h3>
            <ArrowRight
              className="size-4 shrink-0 text-brand-700 transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </Card>
    </Link>
  );
}
