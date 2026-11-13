import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import {
  Activity, Award, BarChart3, BookOpenCheck, Bot, CalendarDays, FileSearch, GraduationCap, Home, KeyRound,
  Link2, LogOut, Menu, MessageSquareText, ShieldAlert, Upload, UserRound, X,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo.jsx';
import { IconButton, Tooltip } from '../components/ui/index.jsx';
import { cn } from '../lib/cn.js';
import userAvatar from '../assets/illustrations/user_avatar.png';
import adminAvatar from '../assets/illustrations/admin_avatar.png';
import { useAuth } from '../context/auth-context.js';
import { NotificationProvider } from '../features/notifications/NotificationProvider.jsx';
import { NotificationBell } from '../features/notifications/NotificationBell.jsx';

const navSections = [
  {
    label: 'Workspace',
    items: [
      { label: 'Home', to: '/', icon: Home },
      { label: 'Ask EWAGuard AI', to: '/assistant', icon: Bot },
    ],
  },
  {
    label: 'Security tools',
    items: [
      { label: 'Analyze Email', to: '/analyze/email', icon: MessageSquareText },
      { label: 'Analyze URL', to: '/analyze/url', icon: Link2 },
      { label: 'Analyze File', to: '/analyze/file', icon: Upload },
      { label: 'Password Security', to: '/password-security', icon: KeyRound },
      { label: 'My Incidents', to: '/incidents', icon: ShieldAlert },
    ],
  },
  {
    label: 'Security Awareness',
    items: [
      { label: 'My Training', to: '/training', icon: GraduationCap },
      { label: 'Monthly Quiz', to: '/monthly-quiz', icon: CalendarDays },
      { label: 'Certificates', to: '/certificates', icon: Award },
    ],
  },
  { label: 'Connect', items: [
    { label: 'Security Community', to: '/community', icon: FileSearch },
    { label: 'Profile', to: '/profile', icon: UserRound },
  ] },
];

const adminSections = [
  { label: 'Security operations', items: [
    { label: 'Administrator dashboard', to: '/admin', icon: Home },
    { label: 'Incident Queue', to: '/admin/incidents', icon: ShieldAlert },
    { label: 'Security analytics', to: '/admin/analytics/security', icon: Activity },
    { label: 'Incident Statistics', to: '/admin/analytics/incidents', icon: BarChart3 },
    { label: 'Audit Logs', to: '/admin/audit', icon: FileSearch },
  ] },
  { label: 'Security awareness', items: [
    { label: 'Training programs', to: '/admin/training', icon: GraduationCap },
    { label: 'Monthly quizzes', to: '/admin/monthly-quizzes', icon: CalendarDays },
    { label: 'Certificates', to: '/admin/certificates', icon: Award },
    { label: 'Awareness analytics', to: '/admin/analytics/awareness', icon: BookOpenCheck },
  ] },
  { label: 'Community', items: [
    { label: 'Community moderation', to: '/admin/community', icon: FileSearch },
  ] },
  { label: 'Account', items: [
    { label: 'Users', to: '/admin/users', icon: UserRound },
    { label: 'Profile', to: '/profile', icon: UserRound },
  ] },
];

function SidebarContent({ onNavigate }) {
  const { user } = useAuth();
  const sections = user.role === 'IT_SECURITY_ADMIN'
    ? adminSections
    : navSections;
  return (
    <>
      <div className="relative flex h-24 shrink-0 items-center px-6">
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-400 via-brand-500 to-danger-500" />
        <NavLink
          to={user.role === 'IT_SECURITY_ADMIN' ? '/admin' : '/'}
          onClick={onNavigate}
          className="flex max-w-full items-center rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-4 focus-visible:ring-offset-navy-950"
        >
          <BrandLogo compact />
        </NavLink>
      </div>

      <nav aria-label="Primary navigation" className="portal-sidebar-scroll flex-1 overflow-y-auto px-3 pb-5 pt-3">
        {sections.map((section) => (
          <div key={section.label} className="mb-5 last:mb-0">
            <p className="mb-2 px-3 text-[0.65rem] font-bold uppercase tracking-[0.19em] text-slate-400">{section.label}</p>
            <ul className="space-y-1">
              {section.items.map(({ label, to, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={to === '/' || to === '/admin'}
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
                        <span className="min-w-0 py-2 leading-5">{label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

    </>
  );
}

export function AppShell() {
  return <NotificationProvider><Shell /></NotificationProvider>;
}
function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const mobileDialogRef = useRef(null);
  const mainRef = useRef(null);
  const shellRef = useRef(null);
  const { pathname } = useLocation();
  const isAssistant = pathname === '/assistant';
  const previousPath = useRef(pathname);
  const { user, logout } = useAuth();
  const avatar = user.role === 'IT_SECURITY_ADMIN' ? adminAvatar : userAvatar;
  const roleLabel = user.role === 'IT_SECURITY_ADMIN' ? 'IT / Security Administrator' : 'Employee';

  // The visual viewport also shrinks when a mobile keyboard opens.
  useEffect(() => {
    if (!isAssistant) return undefined;
    const shell = shellRef.current;
    const viewport = window.visualViewport;
    const resize = () => {
      if (!viewport || viewport.scale === 1) shell?.style.setProperty('--assistant-viewport-height', `${viewport?.height ?? window.innerHeight}px`);
    };
    resize();
    viewport?.addEventListener('resize', resize);
    window.addEventListener('resize', resize);
    return () => { viewport?.removeEventListener('resize', resize); window.removeEventListener('resize', resize); shell?.style.removeProperty('--assistant-viewport-height'); };
  }, [isAssistant]);

  async function handleLogout() {
    setLoggingOut(true);
    try { await logout(); } catch { /* AuthProvider clears local state; returning to login is safe. */ }
    finally { setLoggingOut(false); }
  }

  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!mobileOpen) { if (dialog.open) dialog.close(); return undefined; }
    if (!dialog.open) dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [mobileOpen]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 64rem)');
    const closeOnDesktop = () => { if (desktop.matches) setMobileOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    const page = [...navSections, ...adminSections].flatMap((section) => section.items).find((item) => item.to === pathname)?.label;
    const incidentPage = pathname.startsWith('/admin/analytics/incidents') ? 'Incident Statistics' : pathname.startsWith('/admin/analytics/security') ? 'Security analytics' : pathname.startsWith('/admin/analytics/awareness') ? 'Awareness analytics' : pathname.startsWith('/admin/incidents') ? 'Incident Queue' : pathname.startsWith('/incidents/') ? 'Incident details' : pathname.startsWith('/admin/training') ? 'Training management' : pathname.startsWith('/admin/monthly-quizzes') ? 'Monthly quiz management' : pathname.startsWith('/admin/certificates') ? 'Certificate management' : pathname.startsWith('/admin/community') ? 'Community moderation' : pathname.startsWith('/certificates/') ? 'Certificate details' : pathname.startsWith('/monthly-quiz/') ? 'Monthly quiz' : pathname.startsWith('/training/') ? 'Training course' : null;
    const other = { '/admin': 'Administrator dashboard', '/unauthorized': 'Access restricted', '/design-system/chat': 'Chat design' }[pathname];
    document.title = `${page ?? incidentPage ?? other ?? 'Page not found'} | EWAGuard AI`;
    if (previousPath.current !== pathname) {
      if (mobileDialogRef.current.open) mobileDialogRef.current.close();
      mainRef.current?.focus();
      window.scrollTo({ top: 0, behavior: 'instant' });
      previousPath.current = pathname;
    }
  }, [pathname]);

  return (
    <div ref={shellRef} className={cn('app-surface text-slate-900', isAssistant ? 'assistant-shell' : 'min-h-screen')}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <aside className="portal-sidebar fixed inset-y-0 left-0 z-40 hidden flex-col bg-navy-950 lg:flex">
        <SidebarContent />
      </aside>

      <dialog ref={mobileDialogRef} id="mobile-navigation" className="portal-navigation" aria-label="Mobile navigation" onCancel={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setMobileOpen(false); }}>
          <div className="relative flex h-full flex-col bg-navy-950 shadow-float">
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-lg text-slate-300 hover:bg-slate-100 hover:text-slate-900" aria-label="Close navigation"><X className="size-5" /></button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
      </dialog>

      <div className={cn('portal-frame', isAssistant && 'assistant-frame')}>
        <header className="portal-header sticky top-0 z-30 flex h-[4.75rem] items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 shadow-[0_1px_0_rgb(15_23_42/0.02)] backdrop-blur-xl sm:px-6 lg:px-8">
          <IconButton label="Open navigation" aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => setMobileOpen(true)} className="shrink-0 lg:hidden"><Menu className="size-5" /></IconButton>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900"><span className="sm:hidden">EWAGuard AI</span><span className="hidden sm:inline">EWAGuard AI Security Portal</span></p>
            <p className="hidden text-xs text-slate-500 sm:block">Electricity &amp; Water Authority</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2.5">
            <NotificationBell />
            <span className="mx-1 hidden h-8 w-px bg-slate-200 sm:block" />
            <NavLink aria-label="Your profile" to="/profile" className="flex items-center gap-3 rounded-xl p-1.5 pr-2 transition-colors hover:bg-slate-100">
              <img src={avatar} alt="" className="size-9 rounded-full border border-slate-200 bg-white object-cover shadow-sm" />
              <span className="hidden text-left xl:block"><span className="block text-sm font-bold text-slate-800">{user.firstName} {user.lastName}</span><span className="block text-[0.7rem] text-slate-500">{roleLabel}</span></span>
            </NavLink>
            <Tooltip label={loggingOut ? 'Signing out' : 'Sign out'}><IconButton label="Sign out" disabled={loggingOut} onClick={handleLogout}><LogOut className="size-[1.1rem]" /></IconButton></Tooltip>
          </div>
        </header>
        <main ref={mainRef} id="main-content" tabIndex={-1} className={cn(
          isAssistant ? 'assistant-main' : 'portal-main',
        )}><Outlet /></main>
      </div>
    </div>
  );
}
