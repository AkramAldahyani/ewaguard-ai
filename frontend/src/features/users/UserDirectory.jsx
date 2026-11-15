import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  MoreHorizontal,
  ShieldCheck,
  Eye,
  Pencil,
  UserCheck,
  UserX,
  PauseCircle,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { Badge, Skeleton } from '../../components/ui/index.jsx';
import { accountStatuses, fullName, initials, roleName, dateLabel } from './users-model.js';

export function AccountBadge({ user }) {
  const status = user.deletedAt ? 'DELETED' : user.status;
  return (
    <Badge tone={{ ACTIVE: 'success', INVITED: 'brand', SUSPENDED: 'warning' }[status] ?? 'neutral'}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {accountStatuses[status] ?? status}
    </Badge>
  );
}
export function RoleBadge({ role }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${role === 'IT_SECURITY_ADMIN' ? 'text-brand-800' : 'text-slate-600'}`}
    >
      {role === 'IT_SECURITY_ADMIN' && <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />}
      {roleName(role)}
    </span>
  );
}
export function UserAvatar({ user }) {
  return (
    <span
      aria-hidden="true"
      className={`user-avatar ${user.role.name === 'IT_SECURITY_ADMIN' ? 'user-avatar-admin' : ''}`}
    >
      {initials(user)}
    </span>
  );
}
function UserActions({ user, onAction, manualSetupEnabled }) {
  const [position, setPosition] = useState(null);
  const trigger = useRef(null),
    menu = useRef(null),
    id = useId();
  const actions = [
    ['view', 'View account', Eye],
    ...(!user.deletedAt
      ? [
          ['edit', 'Edit details', Pencil],
          ...(manualSetupEnabled && user.status === 'INVITED' ? [['setup', 'Generate New Setup Link', KeyRound]] : []),
          ...(user.status !== 'ACTIVE' ? [['activate', 'Activate account', UserCheck]] : []),
          ...(user.status !== 'SUSPENDED' ? [['suspend', 'Suspend account', PauseCircle]] : []),
          ...(user.status !== 'DEACTIVATED' ? [['deactivate', 'Deactivate account', UserX]] : []),
          ['role', 'Change role', ShieldCheck],
          ['delete', 'Remove account', Trash2],
        ]
      : []),
  ];
  useEffect(() => {
    if (!position) return undefined;
    menu.current?.querySelector('button')?.focus();
    const close = (event) => {
      if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setPosition(null);
    };
    const reposition = () => setPosition(null);
    document.addEventListener('pointerdown', close);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [position]);
  function close() {
    setPosition(null);
    trigger.current?.focus();
  }
  function keyDown(event) {
    const buttons = [...menu.current.querySelectorAll('button')],
      index = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      close();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      buttons[
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? buttons.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      ]?.focus();
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="ui-icon-button"
        aria-label={`Actions for ${fullName(user)}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        aria-controls={position ? id : undefined}
        onClick={() => {
          if (position) {
            close();
            return;
          }
          const rect = trigger.current.getBoundingClientRect(),
            height = actions.length * 42 + 16;
          setPosition({
            left: Math.max(8, Math.min(rect.right - 224, window.innerWidth - 232)),
            top: rect.bottom + height < window.innerHeight ? rect.bottom + 5 : Math.max(8, rect.top - height - 5),
          });
        }}
      >
        <MoreHorizontal className="size-5" aria-hidden="true" />
      </button>
      {position &&
        createPortal(
          <div
            id={id}
            ref={menu}
            role="menu"
            aria-label={`Account actions for ${fullName(user)}`}
            className="users-action-menu"
            style={position}
            onKeyDown={keyDown}
          >
            {actions.map(([action, label, Icon]) => (
              <button
                role="menuitem"
                type="button"
                key={action}
                className={action === 'delete' ? 'text-danger-700' : ''}
                onClick={() => {
                  close();
                  onAction(action, user.id);
                }}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

export function DirectorySkeleton() {
  return (
    <div role="status" aria-label="Loading user directory" className="p-5">
      <span className="sr-only">Loading user directory</span>
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex items-center gap-4 border-b border-slate-100 py-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-52" />
          </div>
          <Skeleton className="hidden h-6 w-24 sm:block" />
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

export function UserDirectory({ users, selectedId, onAction, manualSetupEnabled }) {
  const openName = (user) => (
    <button type="button" className="user-name" onClick={() => onAction('view', user.id)}>
      {fullName(user)}
    </button>
  );
  return (
    <>
      <div className="users-table-view">
        <table className="users-table">
          <caption className="sr-only">User directory</caption>
          <colgroup>
            {[20, 12, 19, 12, 12, 11, 9, 5].map((width, i) => (
              <col key={i} style={{ width: `${width}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {['User name', 'Employee ID', 'Email', 'Department', 'Role', 'Status', 'Last login', 'Actions'].map(
                (label) => (
                  <th key={label} scope="col">
                    {label === 'Actions' ? <span className="sr-only">Actions</span> : label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={selectedId === user.id ? 'user-row-selected' : ''}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <UserAvatar user={user} />
                    <div className="min-w-0">{openName(user)}</div>
                  </div>
                </td>
                <td className="font-mono text-xs">
                  {user.employeeIdentifier || <span className="text-slate-400">Not assigned</span>}
                </td>
                <td>{user.email}</td>
                <td>{user.department?.name ?? 'Not assigned'}</td>
                <td>
                  <RoleBadge role={user.role.name} />
                </td>
                <td>
                  <AccountBadge user={user} />
                </td>
                <td className="text-xs text-slate-500">{dateLabel(user.lastLoginAt)}</td>
                <td>
                  <UserActions user={user} onAction={onAction} manualSetupEnabled={manualSetupEnabled} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="users-card-view">
        {users.map((user) => (
          <article
            key={user.id}
            aria-label={fullName(user)}
            className={`user-mobile-card ${selectedId === user.id ? 'user-row-selected' : ''}`}
          >
            <div className="flex items-start gap-3">
              <UserAvatar user={user} />
              <div className="min-w-0 flex-1">
                {openName(user)}
                <p className="mt-1 break-all text-xs text-slate-500">{user.email}</p>
              </div>
              <UserActions user={user} onAction={onAction} manualSetupEnabled={manualSetupEnabled} />
            </div>
            <div className="my-4 flex flex-wrap items-center gap-3">
              <AccountBadge user={user} />
              <RoleBadge role={user.role.name} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <dt>Employee ID</dt>
                <dd className="font-mono">{user.employeeIdentifier ?? 'Not assigned'}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{user.department?.name ?? 'Not assigned'}</dd>
              </div>
              <div className="col-span-2">
                <dt>Last login</dt>
                <dd>{dateLabel(user.lastLoginAt)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
