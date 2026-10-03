import { Navigate, Outlet, useLocation } from 'react-router';
import { BrandLogo } from '../BrandLogo.jsx';
import { useAuth } from '../../context/auth-context.js';

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <SessionLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <SessionLoading />;
  return user ? <Navigate to="/" replace /> : children;
}

function SessionLoading() {
  return <div className="grid min-h-screen place-items-center bg-slate-50 px-6"><div className="text-center"><BrandLogo className="justify-center" /><span className="mx-auto mt-6 block size-7 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-slate-600" role="status">Checking your secure session…</p></div></div>;
}
