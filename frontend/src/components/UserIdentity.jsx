import { useState } from 'react';
import { Copy } from 'lucide-react';

export function CopyIdentifier({ value, label = 'User ID' }) {
  const [message, setMessage] = useState('');
  if (!value) return <span className="text-xs text-slate-500">{label}: Unavailable</span>;
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setMessage('Copied'); }
    catch { setMessage('Select the ID to copy it.'); }
  };
  return <span className="inline-flex max-w-full flex-wrap items-center gap-1 text-xs text-slate-600">
    <span>{label}:</span><code className="break-all select-all">{value}</code>
    <button type="button" aria-label={`Copy ${label} ${value}`} onClick={copy}
      className="rounded p-1 text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600">
      <Copy className="size-3.5" aria-hidden="true" />
    </button><span role="status" className="sr-only">{message}</span>
  </span>;
}

export function UserIdentity({ user, userId, kind, department, showRole = false }) {
  const id = user?.id ?? userId;
  const system = kind === 'SYSTEM' && !id;
  const name = system ? 'System' : [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || 'Unknown User';
  const role = typeof user?.role === 'string' ? user.role : user?.role?.name;
  const roleLabel = system ? 'System' : role === 'IT_SECURITY_ADMIN' ? 'Administrator' : role === 'EMPLOYEE' ? 'Employee' : 'Unavailable';
  const departmentName = user?.department?.name ?? department?.name;
  return <div className="min-w-0 space-y-1 whitespace-normal">
    <p className="break-words text-sm font-semibold text-slate-800">{name}</p>
    {!system && <CopyIdentifier value={id} />}
    {user?.employeeIdentifier && <p className="text-xs text-slate-500">Employee ID: <span className="select-all">{user.employeeIdentifier}</span></p>}
    {departmentName && <p className="text-xs text-slate-500">{departmentName}</p>}
    {showRole && <p className="text-xs text-slate-500">{roleLabel}</p>}
  </div>;
}
