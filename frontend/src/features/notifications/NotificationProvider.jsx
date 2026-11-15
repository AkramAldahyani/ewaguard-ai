import { useEffect, useState } from 'react';
import { useAuth } from '../../context/auth-context.js';
import { NotificationContext } from './notification-context.js';
import { createNotificationFlow } from './notification-flow.js';

export function NotificationProvider({ children }) {
  const { user, sessionId } = useAuth();
  if (!user) return children;
  return (
    <SessionNotifications key={`${user.id}:${user.role}:${sessionId}`} user={user} sessionId={sessionId}>
      {children}
    </SessionNotifications>
  );
}
function SessionNotifications({ children, user, sessionId }) {
  const [flow] = useState(() =>
    createNotificationFlow({
      userId: user.id,
      role: user.role,
      sessionId,
      onUnauthorized: () => window.dispatchEvent(new CustomEvent('ewaguard:session-expired')),
    }),
  );
  useEffect(() => {
    flow.start();
    const resume = () => {
      if (document.visibilityState === 'visible') flow.resume();
    };
    const stop = () => flow.stop();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('ewaguard:session-expired', stop);
    window.addEventListener('ewaguard:signing-out', stop);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('ewaguard:session-expired', stop);
      window.removeEventListener('ewaguard:signing-out', stop);
      flow.stop();
    };
  }, [flow]);
  return <NotificationContext.Provider value={flow}>{children}</NotificationContext.Provider>;
}
