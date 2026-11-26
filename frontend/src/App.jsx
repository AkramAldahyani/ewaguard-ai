import { Navigate, Route, Routes } from 'react-router';
import { ToastProvider } from './components/ui/ToastProvider.jsx';
import { AuthProvider } from './context/auth.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './components/auth/ProtectedRoute.jsx';
import { AppShell } from './layouts/AppShell.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { UnauthorizedPage } from './pages/AccessPages.jsx';
import { AdminDashboardPage } from './features/dashboard/AdminDashboardPage.jsx';
import { AuditLogsPage } from './features/audit/AuditLogsPage.jsx';
import { SecurityAnalyticsPage } from './features/analytics/SecurityAnalyticsPage.jsx';
import { IncidentStatisticsPage } from './features/analytics/IncidentStatisticsPage.jsx';
import { AwarenessAnalyticsPage } from './features/analytics/AwarenessAnalyticsPage.jsx';
import { FileAnalyzerPage } from './features/file/FileAnalyzerPage.jsx';
import { UrlAnalyzerPage } from './features/url/UrlAnalyzerPage.jsx';
import {
  EmployeeCertificateListPage,
  EmployeeCertificateDetailPage,
} from './features/certificates/EmployeeCertificatePages.jsx';
import {
  AdminCertificateListPage,
  AdminCertificateDetailPage,
} from './features/certificates/AdminCertificatePages.jsx';
import { AdminMonthlyDetailPage, AdminMonthlyListPage } from './features/monthly-quizzes/AdminMonthlyPages.jsx';
import {
  EmployeeMonthlyDetailPage,
  EmployeeMonthlyListPage,
} from './features/monthly-quizzes/EmployeeMonthlyPages.jsx';
import { AdminTrainingDetailPage, AdminTrainingListPage } from './features/training/AdminTrainingPages.jsx';
import { EmployeeTrainingDetailPage, EmployeeTrainingListPage } from './features/training/EmployeeTrainingPages.jsx';
import { ProfilePage } from './pages/employee/WorkspacePages.jsx';
import { AdminCommunityPage } from './features/community/AdminCommunityPage.jsx';
import { EmployeeCommunityPage } from './features/community/EmployeeCommunityPage.jsx';
import { IncidentListPage, IncidentDetailPage } from './features/incidents/IncidentPages.jsx';
import { PasswordSecurityPage } from './features/password/PasswordSecurityPage.jsx';
import { AssistantPage } from './features/chat/AssistantPage.jsx';
import { EmailAnalyzerPage } from './features/email/EmailAnalyzerPage.jsx';
import { UserManagementPage } from './features/users/UserManagementPage.jsx';

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ToastProvider>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="profile" element={<ProfilePage />} />
          <Route element={<ProtectedRoute roles={['EMPLOYEE']} />}>
            <Route index element={<HomePage />} />
            <Route path="home" element={<Navigate to="/" replace />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="analyze/email" element={<EmailAnalyzerPage />} />
            <Route path="analyze/url" element={<UrlAnalyzerPage />} />
            <Route path="analyze/file" element={<FileAnalyzerPage />} />
            <Route path="password-security" element={<PasswordSecurityPage />} />
            <Route path="incidents" element={<IncidentListPage />} />
            <Route path="incidents/:id" element={<IncidentDetailPage />} />
            <Route path="training" element={<EmployeeTrainingListPage />} />
            <Route path="training/:id" element={<EmployeeTrainingDetailPage />} />
            <Route path="monthly-quiz" element={<EmployeeMonthlyListPage />} />
            <Route path="monthly-quiz/:id" element={<EmployeeMonthlyDetailPage />} />
            <Route path="certificates" element={<EmployeeCertificateListPage />} />
            <Route path="certificates/:id" element={<EmployeeCertificateDetailPage />} />
            <Route path="community" element={<EmployeeCommunityPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={['IT_SECURITY_ADMIN']} />}>
            <Route path="admin" element={<AdminDashboardPage />} />
            <Route path="admin/users" element={<UserManagementPage />} />
            <Route path="admin/audit" element={<AuditLogsPage />} />
            <Route path="admin/analytics/security" element={<SecurityAnalyticsPage />} />
            <Route path="admin/analytics/incidents" element={<IncidentStatisticsPage />} />
            <Route path="admin/analytics/awareness" element={<AwarenessAnalyticsPage />} />
            <Route path="admin/incidents" element={<IncidentListPage admin />} />
            <Route path="admin/incidents/:id" element={<IncidentDetailPage admin />} />
            <Route path="admin/training" element={<AdminTrainingListPage />} />
            <Route path="admin/training/new" element={<AdminTrainingDetailPage />} />
            <Route path="admin/training/:id" element={<AdminTrainingDetailPage />} />
            <Route path="admin/monthly-quizzes" element={<AdminMonthlyListPage />} />
            <Route path="admin/monthly-quizzes/new" element={<AdminMonthlyDetailPage />} />
            <Route path="admin/monthly-quizzes/:id" element={<AdminMonthlyDetailPage />} />
            <Route path="admin/certificates" element={<AdminCertificateListPage />} />
            <Route path="admin/certificates/:id" element={<AdminCertificateDetailPage />} />
            <Route path="admin/community" element={<AdminCommunityPage />} />
          </Route>
          <Route path="unauthorized" element={<UnauthorizedPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
