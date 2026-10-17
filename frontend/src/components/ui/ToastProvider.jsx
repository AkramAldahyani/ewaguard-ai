import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ToastContext } from '../../context/toast.js';

let nextToastId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const showToast = useCallback(({ title, message, tone = 'info' }) => {
    const id = nextToastId++;
    setToasts((current) => [...current.slice(-2), { id, title, message, tone }]);
    window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  const value = useMemo(() => ({ showToast }), [showToast]);
  return <ToastContext.Provider value={value}>{children}<div className="fixed bottom-4 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">{toasts.map((toast) => { const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? XCircle : Info; return <div key={toast.id} role={toast.tone === 'error' ? 'alert' : 'status'} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-float"><Icon className={`mt-0.5 size-5 shrink-0 ${toast.tone === 'error' ? 'text-danger-600' : toast.tone === 'success' ? 'text-success-600' : 'text-brand-600'}`} aria-hidden="true" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-900">{toast.title}</p>{toast.message && <p className="mt-0.5 text-sm text-slate-600">{toast.message}</p>}</div><button type="button" onClick={() => dismiss(toast.id)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Dismiss ${toast.title}`}><X className="size-4" /></button></div>; })}</div></ToastContext.Provider>;
}
