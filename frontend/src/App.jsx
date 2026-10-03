import { Route, Routes } from 'react-router';
import { ToastProvider } from './components/ui/ToastProvider.jsx';
import { AppShell } from './layouts/AppShell.jsx';
import { DesignSystemPage } from './pages/DesignSystemPage.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';

const placeholders = [
  ['/assistant', 'EWAGuard AI'],
  ['/analyze/email', 'Email analyzer'],
  ['/analyze/url', 'URL analyzer'],
  ['/analyze/file', 'File analyzer'],
  ['/password-security', 'Password security'],
  ['/incidents', 'My incidents'],
  ['/training', 'Security awareness'],
  ['/community', 'Security community'],
  ['/profile', 'Profile'],
];

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          {placeholders.map(([path, title]) => (
            <Route key={path} path={path} element={<PlaceholderPage title={title} />} />
          ))}
          <Route path="design-system" element={<DesignSystemPage />} />
          <Route path="*" element={<PlaceholderPage title="Page not found" description="The requested route is not part of the current application shell." />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
