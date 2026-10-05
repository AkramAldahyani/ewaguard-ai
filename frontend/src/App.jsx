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
import { AnalysisPage } from './pages/employee/AnalysisPages.jsx';
import { CertificatesPage, MonthlyQuizPage, TrainingPage } from './pages/employee/AwarenessPages.jsx';
import { CommunityPage, IncidentsPage, ProfilePage } from './pages/employee/WorkspacePages.jsx';
import { PasswordSecurityPage } from './features/password/PasswordSecurityPage.jsx';
import { AssistantPage } from './features/chat/AssistantPage.jsx';
import { ChatShowcase } from './features/chat/ChatShowcase.jsx';

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
            <Route path="analyze/email" element={<AnalysisPage kind="email" />} />
            <Route path="analyze/url" element={<AnalysisPage kind="url" />} />
            <Route path="analyze/file" element={<AnalysisPage kind="file" />} />
            <Route path="password-security" element={<PasswordSecurityPage />} />
            <Route path="incidents" element={<IncidentsPage />} />
            <Route path="training" element={<TrainingPage />} />
            <Route path="monthly-quiz" element={<MonthlyQuizPage />} />
            <Route path="certificates" element={<CertificatesPage />} />
            <Route path="community" element={<CommunityPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['IT_SECURITY_ADMIN']} />}>
            <Route path="admin" element={<AdminWorkspace />} />
          </Route>
          <Route path="unauthorized" element={<UnauthorizedPage />} />
          <Route path="design-system" element={<DesignSystemPage />} />
          <Route path="*" element={<PlaceholderPage title="Page not found" description="The requested route is not part of the current application shell." />} />
        </Route></Route>
      </Routes>
  );
}
