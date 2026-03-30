import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import type { User } from '@/types';

// Auth feature - lazy loaded
const EnterpriseLoginPage = lazy(
  () => import('@/features/auth/components/enterprise-login-page'),
);
const LguLoginPage = lazy(
  () => import('@/features/lgu/master/components/LguLoginView'),
);

// Enterprise feature - lazy loaded
const EnterpriseShell = lazy(
  () => import('@/components/layout/EnterpriseShell'),
);
const DashboardPage = lazy(
  () => import('@/views/enterprise/DashboardView'),
);
const CameraMonitoringPage = lazy(
  () => import('@/views/enterprise/CameraMonitoringView'),
);
const CameraLogsPage = lazy(
  () => import('@/views/enterprise/CameraLogsView'),
);
const ReportCenterPage = lazy(
  () => import('@/views/enterprise/ReportCenterView'),
);
const ArchivedReportsPage = lazy(
  () => import('@/views/enterprise/ArchivedReportsView'),
);
const AccountSettingsPage = lazy(
  () => import('@/views/enterprise/AccountSettingsView'),
);

// LGU feature - lazy loaded
const LguSidebarLayout = lazy(
  () => import('@/features/lgu/master/components/LguSidebarLayout'),
);
const OverviewPage = lazy(
  () => import('@/features/lgu/master/views/OverviewView'),
);
const MapPage = lazy(
  () => import('@/features/lgu/master/views/MapView'),
);
const EnterpriseManagementPage = lazy(
  () => import('@/features/lgu/master/views/EnterpriseManagementView'),
);
const EnterpriseLogsPage = lazy(
  () => import('@/features/lgu/master/views/EnterpriseLogsView'),
);
const ReportsWorkspacePage = lazy(
  () => import('@/features/lgu/master/views/ReportsWorkspaceView'),
);
const SettingsPage = lazy(
  () => import('@/features/lgu/master/views/SettingsView'),
);

interface AppRoutesProps {
  user: User | null;
  hasLguSession: boolean;
  hasEnterpriseSession: boolean;
  lguAdminUsername: string;
  onEnterpriseLogin: (user: User) => void;
  onLguLogin: (username: string) => void;
  onLguLogout: () => void;
  onEnterpriseLogout: () => void;
}

export default function AppRoutes({
  user,
  hasLguSession,
  hasEnterpriseSession,
  lguAdminUsername,
  onEnterpriseLogin,
  onLguLogin,
  onLguLogout,
  onEnterpriseLogout,
}: AppRoutesProps): JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-white text-slate-700">
          Loading portal...
        </div>
      }
    >
      <Routes>
        {/* LGU Login */}
        <Route
          path="/lgu/login"
          element={
            hasLguSession ? (
              <Navigate to="/lgu/overview" replace />
            ) : (
              <LguLoginPage onLogin={onLguLogin} />
            )
          }
        />

        {/* Legacy login redirect */}
        <Route path="/login" element={<Navigate to="/lgu/login" replace />} />

        {/* Enterprise Login */}
        <Route
          path="/enterprise/login"
          element={
            hasEnterpriseSession ? (
              <Navigate to="/enterprise/dashboard" replace />
            ) : (
              <EnterpriseLoginPage onLogin={onEnterpriseLogin} />
            )
          }
        />

        {/* LGU Portal Routes */}
        <Route
          path="/lgu"
          element={
            <ProtectedRoute isAllowed={hasLguSession}>
              <LguSidebarLayout onLogout={onLguLogout} adminUsername={lguAdminUsername} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OverviewPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="enterprise-management" element={<EnterpriseManagementPage />} />
          <Route path="enterprise-logs" element={<EnterpriseLogsPage />} />
          <Route path="reports" element={<ReportsWorkspacePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Legacy app routes redirect */}
        <Route path="/app/*" element={<Navigate to="/lgu/overview" replace />} />

        {/* Enterprise Portal Routes */}
        <Route
          path="/enterprise"
          element={
            <ProtectedRoute isAllowed={hasEnterpriseSession} redirectTo="/enterprise/login">
              <EnterpriseShell user={user as User} onLogout={onEnterpriseLogout} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="camera-monitoring" element={<CameraMonitoringPage />} />
          <Route path="camera-logs" element={<CameraLogsPage />} />
          <Route path="report-center" element={<ReportCenterPage />} />
          <Route path="archived-reports" element={<ArchivedReportsPage />} />
          <Route path="account" element={<AccountSettingsPage />} />
        </Route>

        {/* Catch-all redirect */}
        <Route
          path="*"
          element={
            <Navigate
              to={
                hasEnterpriseSession
                  ? '/enterprise/dashboard'
                  : hasLguSession
                    ? '/lgu/overview'
                    : '/lgu/login'
              }
              replace
            />
          }
        />
      </Routes>
    </Suspense>
  );
}
