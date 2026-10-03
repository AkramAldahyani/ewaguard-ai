import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import {
  Bell, Bot, ChevronRight, FileSearch, GraduationCap, Home, KeyRound,
  Link2, Menu, MessageSquareText, Search, ShieldAlert, Upload, X,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { IconButton, Tooltip } from '../components/ui/index.jsx';
import { cn } from '../lib/cn.js';
import userAvatar from '../assets/illustrations/user_avatar.png';

const navSections = [
  {
    label: 'Workspace',
    items: [
      { label: 'Home', to: '/', icon: Home },
      { label: 'EWAGuard AI', to: '/assistant', icon: Bot },
    ],
  },
  {
    label: 'Security tools',
    items: [
      { label: 'Email analyzer', to: '/analyze/email', icon: MessageSquareText },
      { label: 'URL analyzer', to: '/analyze/url', icon: Link2 },
      { label: 'File analyzer', to: '/analyze/file', icon: Upload },
      { label: 'Password security', to: '/password-security', icon: KeyRound },
    ],
  },
  {
    label: 'My security',
    items: [
      { label: 'My incidents', to: '/incidents', icon: ShieldAlert },
      { label: 'Security awareness', to: '/training', icon: GraduationCap },
      { label: 'Security community', to: '/community', icon: FileSearch },
    ],
  },
];

function SidebarContent({ onNavigate }) {
  return (
    <>
      <div className="relative flex h-24 items-center border-b border-white/8 px-5">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-400 via-brand-500 to-danger-500" />
        <NavLink to="/" onClick={onNavigate} className="flex w-full items-center rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-white/20">
          <BrandLogo compact />
        </NavLink>
      </div>

      <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-5">
        {navSections.map((section) => (
          <div key={section.label} className="mb-6 last:mb-0">
            <p className="mb-2 px-3 text-[0.65rem] font-bold uppercase tracking-[0.19em] text-slate-500">{section.label}</p>
            <ul className="space-y-1">
              {section.items.map(({ label, to, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) => cn(
                      'group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-3.5 text-sm font-semibold transition-all duration-150',
                      isActive
                        ? 'bg-white/[0.09] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05)]'
                        : 'text-slate-400 hover:bg-white/[0.055] hover:text-slate-100',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-400" />}
                        <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg transition-colors', isActive ? 'bg-brand-500/15 text-cyan-200' : 'text-slate-500 group-hover:text-slate-300')}><Icon className="size-[1.05rem]" aria-hidden="true" /></span>
                        <span className="truncate">{label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3">
        <div className="mb-3 rounded-2xl border border-white/8 bg-white/[0.035] p-3.5">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200"><span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgb(52_211_153/0.08)]" />Workspace protected</div>
          <p className="mt-2 text-[0.7rem] leading-5 text-slate-500">Security tools detect. Risk logic evaluates. AI explains.</p>
        </div>
        <NavLink to="/design-system" onClick={onNavigate} className={({ isActive }) => cn('flex items-center justify-between rounded-xl px-3.5 py-3 text-xs font-semibold transition-colors', isActive ? 'bg-white/10 text-white' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300')}>
          <span>Interface system</span><ChevronRight className="size-3.5" />
        </NavLink>
      </div>
    </>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileCloseRef = useRef(null);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    mobileCloseRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  return (
    <div className="app-surface min-h-screen text-slate-900">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col bg-navy-950 shadow-[8px_0_30px_rgb(7_23_41/0.08)] lg:flex">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-navy-950/65 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Close navigation overlay" />
          <aside className="relative flex h-full w-[min(19rem,88vw)] flex-col bg-navy-950 shadow-float" aria-label="Mobile navigation" role="dialog" aria-modal="true">
            <button ref={mobileCloseRef} type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="Close navigation"><X className="size-5" /></button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 flex h-[4.75rem] items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 shadow-[0_1px_0_rgb(15_23_42/0.02)] backdrop-blur-xl sm:px-6 lg:px-8">
          <IconButton label="Open navigation" onClick={() => setMobileOpen(true)} className="lg:hidden"><Menu className="size-5" /></IconButton>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">Employee Security Portal</p>
            <p className="hidden text-xs text-slate-500 sm:block">Electricity &amp; Water Authority</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
            <Tooltip label="Search will be available in a later phase"><IconButton label="Search unavailable" aria-disabled="true"><Search className="size-[1.1rem]" /></IconButton></Tooltip>
            <Tooltip label="Notifications"><IconButton label="Notifications"><Bell className="size-[1.1rem]" /></IconButton></Tooltip>
            <span className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />
            <NavLink to="/profile" className="flex items-center gap-3 rounded-xl p-1.5 pr-2 transition-colors hover:bg-slate-100">
              <img src={userAvatar} alt="Akram Aldahyani profile avatar" className="size-9 rounded-full border border-slate-200 bg-white object-cover shadow-sm" />
              <span className="hidden text-left xl:block"><span className="block text-sm font-bold text-slate-800">Akram Aldahyani</span><span className="block text-[0.7rem] text-slate-500">Employee preview</span></span>
            </NavLink>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Outlet /></main>
      </div>
    </div>
  );
}
