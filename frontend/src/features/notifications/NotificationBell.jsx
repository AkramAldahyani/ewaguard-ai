import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router';
import { Bell, RefreshCw, X } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/index.jsx';
import { useAuth } from '../../context/auth-context.js';
import { useNotifications } from './notification-context.js';
import { notificationItems } from './notification-flow.js';

const connectionLabels = {
  connecting: 'Connecting to live updates…',
  live: 'Live updates connected',
  reconnecting: 'Reconnecting — live updates interrupted',
  offline: 'Offline — live updates paused',
  unavailable: 'Live updates unavailable',
};
const severityClasses = {
  CRITICAL: 'border-danger-300 bg-danger-50 text-danger-800',
  HIGH: 'border-warning-300 bg-warning-50 text-warning-900',
  MEDIUM: 'border-slate-300 bg-slate-50 text-slate-700',
  LOW: 'border-brand-200 bg-brand-50 text-brand-800',
};
function notificationTime(value) {
  const time = new Date(value);
  return Number.isFinite(time.getTime())
    ? time.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Time unavailable';
}
export function NotificationList({ state, flow, role, onNavigate }) {
  const unreadOnly = role === 'IT_SECURITY_ADMIN';
  const items = notificationItems(state.items, role).filter((item) => !unreadOnly || !item.readAt);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-slate-600">
          {connectionLabels[state.connection]}
        </p>
        {state.connection !== 'live' && (
          <Button size="sm" variant="ghost" onClick={() => flow.reconnect()}>
            Reconnect
          </Button>
        )}
      </div>
      {state.loading && (
        <p role="status" className="py-8 text-center text-sm text-slate-600">
          Loading notifications…
        </p>
      )}
      {state.refreshing && !state.loading && (
        <p role="status" className="text-xs text-slate-500">
          Checking latest notifications…
        </p>
      )}
      {state.error && (
        <div role="alert" className="rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">
          <p>{state.error}</p>
          <Button variant="ghost" size="sm" onClick={() => flow.refresh()}>
            Retry notifications
          </Button>
        </div>
      )}
      {!state.loading && !state.error && items.length === 0 && (
        <div className="py-10 text-center">
          <Bell className="mx-auto mb-3 size-7 text-slate-400" aria-hidden="true" />
          <h3 className="font-semibold">{unreadOnly ? 'No unread notifications' : 'No notifications yet'}</h3>
          <p className="mt-2 text-sm text-slate-500">
            {unreadOnly
              ? 'New incident alerts will appear here. Read notifications are cleared from this list.'
              : 'Updates about your authorized incidents will appear here.'}
          </p>
        </div>
      )}
      <ul className="space-y-3" aria-label="Incident notifications">
        {items.map((item) => (
          <li
            key={item.id}
            className={`rounded-xl border p-4 ${item.readAt ? 'border-slate-200 bg-white' : 'border-brand-200 bg-brand-50/40'}`}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-600">{item.readAt ? 'Read' : 'Unread'}</span>
              {item.severity && (
                <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${severityClasses[item.severity]}`}>
                  {item.severity === 'CRITICAL' ? 'CRITICAL · Urgent' : item.severity}
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-slate-500">{item.kind.replaceAll('_', ' ')}</p>
            <h3 className="mt-1 break-words text-sm font-bold text-slate-900">{item.title}</h3>
            <p className="mt-1 break-words text-sm leading-6 text-slate-600">{item.message}</p>
            <time
              dateTime={Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : undefined}
              className="mt-2 block text-xs text-slate-500"
            >
              {notificationTime(item.createdAt)}
            </time>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Link
                className="rounded-md text-sm font-semibold text-brand-800 underline decoration-brand-200 underline-offset-4 focus-visible:outline-2 focus-visible:outline-brand-600"
                to={`${role === 'IT_SECURITY_ADMIN' ? '/admin' : ''}/incidents/${item.incidentId}`}
                onClick={() => {
                  if (!item.readAt) void flow.read(item.id);
                  onNavigate?.();
                }}
              >
                {item.reference ?? 'View incident'}
              </Link>
              {!item.readAt && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={state.marking.includes(item.id)}
                  aria-label={`Mark ${item.reference ?? 'notification'} as read`}
                  onClick={() => flow.read(item.id)}
                >
                  {state.marking.includes(item.id) ? 'Saving…' : 'Mark as read'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {state.nextCursor && (
        <Button
          variant="secondary"
          className="w-full"
          disabled={state.moreLoading || state.refreshing}
          onClick={() => flow.more()}
        >
          {state.moreLoading ? 'Loading older notifications…' : 'Load more notifications'}
        </Button>
      )}
    </div>
  );
}
export function NotificationTrigger({ state, onClick, controls, open = false }) {
  const urgent = state.items.some((item) => item.severity === 'CRITICAL' && !item.readAt);
  const count = state.unreadCount;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`Notifications, ${count === null ? 'unread count unavailable' : `${count} unread`}${urgent ? ', urgent unread alert' : ''}${state.error ? ', count may be outdated' : ''}`}
      onClick={onClick}
      className={`relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${urgent ? 'border-danger-200 bg-danger-50 text-danger-700' : 'border-transparent text-slate-600 hover:bg-slate-100'}`}
    >
      <Bell className="size-5" aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          className={`absolute -right-1 -top-1 min-w-5 rounded-full px-1 text-[10px] font-bold leading-5 text-white ${urgent ? 'bg-danger-600' : 'bg-brand-700'}`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
export function NotificationBell() {
  const { pathname } = useLocation();
  return <SessionBell key={pathname} />;
}
export function NotificationConnectionStatus() {
  const flow = useNotifications();
  return flow ? <ConnectionStatus flow={flow} /> : <span>Refresh to check for updates</span>;
}
function ConnectionStatus({ flow }) {
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  return <span role="status">{connectionLabels[state.connection]}</span>;
}
function SessionBell() {
  const flow = useNotifications();
  const { user } = useAuth();
  return flow ? <ConnectedBell flow={flow} role={user.role} /> : null;
}
function ConnectedBell({ flow, role }) {
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const id = useId();
  useEffect(() => {
    if (open && !dialog.current.open) dialog.current.showModal();
    if (!open && dialog.current.open) dialog.current.close();
  }, [open]);
  return (
    <>
      <NotificationTrigger
        state={state}
        controls={id}
        open={open}
        onClick={() => {
          setOpen(true);
          flow.resume();
        }}
      />
      <span className="sr-only" role="status" aria-live="polite">
        {state.unreadCount === null ? '' : `${state.unreadCount} unread notifications`}
      </span>
      <dialog
        id={id}
        ref={dialog}
        aria-labelledby={`${id}-title`}
        className="ui-dialog w-[calc(100%_-_2rem)] max-w-lg"
        onCancel={(event) => {
          event.preventDefault();
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-5">
          <h2 id={`${id}-title`} className="text-lg font-bold">
            Notifications
          </h2>
          <div className="flex gap-1">
            <IconButton label="Refresh notifications" disabled={state.refreshing} onClick={() => flow.refresh()}>
              <RefreshCw className="size-4" />
            </IconButton>
            <IconButton label="Close notifications" onClick={() => setOpen(false)}>
              <X className="size-5" />
            </IconButton>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <NotificationList state={state} flow={flow} role={role} onNavigate={() => setOpen(false)} />
        </div>
      </dialog>
    </>
  );
}
