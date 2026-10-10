import { Navigate, Route, Routes } from 'react-router';
import { ToastProvider } from './components/ui/ToastProvider.jsx';
import { AuthProvider } from './context/auth.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './components/auth/ProtectedRoute.jsx';
import { AppShell } from './layouts/AppShell.jsx';
import { DesignSystemPage } from './pages/DesignSystemPage.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { PlaceholderPage } from './pages/PlaceholderPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { AdminWorkspace, UnauthorizedPage } from './pages/AccessPages.jsx';
import { FileAnalyzerPage } from './features/file/FileAnalyzerPage.jsx';
import { UrlAnalyzerPage } from './features/url/UrlAnalyzerPage.jsx';
import { CertificatesPage, MonthlyQuizPage, TrainingPage } from './pages/employee/AwarenessPages.jsx';
import { CommunityPage, ProfilePage } from './pages/employee/WorkspacePages.jsx';
import { IncidentListPage, IncidentDetailPage } from './features/incidents/IncidentPages.jsx';
import { PasswordSecurityPage } from './features/password/PasswordSecurityPage.jsx';
import { AssistantPage } from './features/chat/AssistantPage.jsx';
import { ChatShowcase } from './features/chat/ChatShowcase.jsx';
import { EmailAnalyzerPage } from './features/email/EmailAnalyzerPage.jsx';

export default function App() {
  return <ToastProvider><AuthProvider><AppRoutes /></AuthProvider></ToastProvider>;
}

export function AppRoutes() {
  return (
      <Routes>
        <Route path="login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
        <Route element={<ProtectedRoute />}><Route element={<AppShell />}>
          <Route element={<ProtectedRoute roles={['EMPLOYEE']} />}>
            <Route index element={<HomePage />} />
            <Route path="home" element={<Navigate to="/" replace />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="design-system/chat" element={<ChatShowcase />} />
            <Route path="analyze/email" element={<EmailAnalyzerPage />} />
            <Route path="analyze/url" element={<UrlAnalyzerPage />} />
            <Route path="analyze/file" element={<FileAnalyzerPage />} />
            <Route path="password-security" element={<PasswordSecurityPage />} />
            <Route path="incidents" element={<IncidentListPage />} />
            <Route path="incidents/:id" element={<IncidentDetailPage />} />
            <Route path="training" element={<TrainingPage />} />
            <Route path="monthly-quiz" element={<MonthlyQuizPage />} />
            <Route path="certificates" element={<CertificatesPage />} />
            <Route path="community" element={<CommunityPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['IT_SECURITY_ADMIN']} />}>
            <Route path="admin" element={<AdminWorkspace />} />
            <Route path="admin/incidents" element={<IncidentListPage admin />} />
            <Route path="admin/incidents/:id" element={<IncidentDetailPage admin />} />
          </Route>
          <Route path="unauthorized" element={<UnauthorizedPage />} />
          <Route path="design-system" element={<DesignSystemPage />} />
          <Route path="*" element={<PlaceholderPage title="Page not found" description="The requested route is not part of the current application shell." />} />
        </Route></Route>
      </Routes>
  );
}
