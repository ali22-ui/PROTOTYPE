import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import EnterpriseShell from '@/components/layout/EnterpriseShell';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import {
  ENTERPRISE_SESSION_TOKEN_KEY,
  LGU_SESSION_TOKEN_KEY,
  clearSession,
  createClientSessionToken,
  getStoredUser,
} from '@/services/api';
import type { User } from '@/types';
import LoginView from '@/views/LoginView';
import ArchivedReportsView from '@/views/enterprise/ArchivedReportsView';
import AccountSettingsView from './views/enterprise/AccountSettingsView';
import CameraLogsView from '@/views/enterprise/CameraLogsView';
import CameraMonitoringView from '@/views/enterprise/CameraMonitoringView';
import DashboardView from '@/views/enterprise/DashboardView';
import ReportCenterView from '@/views/enterprise/ReportCenterView';

const LguLoginView = lazy(() => import('@/features/lgu/master/components/LguLoginView'));
const LguSidebarLayout = lazy(
  () => import('@/features/lgu/master/components/LguSidebarLayout'),
);
const LguOverviewView = lazy(() => import('@/features/lgu/master/views/OverviewView'));
const LguMapView = lazy(() => import('@/features/lgu/master/views/MapView'));
const LguEnterpriseManagementView = lazy(
  () => import('@/features/lgu/master/views/EnterpriseManagementView'),
);
const LguEnterpriseLogsView = lazy(
  () => import('@/features/lgu/master/views/EnterpriseLogsView'),
);
const LguReportsWorkspaceView = lazy(
  () => import('@/features/lgu/master/views/ReportsWorkspaceView'),
);
const LguSettingsView = lazy(() => import('@/features/lgu/master/views/SettingsView'));

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isLguAuthenticated, setIsLguAuthenticated] = useState<boolean>(
    () => localStorage.getItem('lgu-auth') === 'true',
  );
  const [lguAdminUsername, setLguAdminUsername] = useState<string>(
    () => localStorage.getItem('lgu-auth-user') || 'LGU Admin',
  );
  const isGitHubPagesHost = globalThis.location.hostname.endsWith('github.io');
  const hasLguSession = isLguAuthenticated
    || localStorage.getItem('lgu-auth') === 'true'
    || Boolean(sessionStorage.getItem(LGU_SESSION_TOKEN_KEY));
  const hasEnterpriseSession = Boolean(
    user?.token && sessionStorage.getItem(ENTERPRISE_SESSION_TOKEN_KEY),
  );

  useEffect(() => {
    if (!user) {
      return;
    }

    localStorage.setItem('enterprise-account-id', user.enterpriseId);
    localStorage.setItem('enterprise-account-name', user.companyName);
  }, [user]);

  const handleLogout = (): void => {
    clearSession();
    setUser(null);
    setIsLguAuthenticated(false);
    setLguAdminUsername('LGU Admin');
  };

  const handleLguLogin = (username: string): void => {
    sessionStorage.setItem(LGU_SESSION_TOKEN_KEY, createClientSessionToken());
    localStorage.setItem('lgu-auth', 'true');
    localStorage.setItem('lgu-auth-user', username || 'LGU Admin');
    setLguAdminUsername(username || 'LGU Admin');
    setIsLguAuthenticated(true);
  };

  const handleLguLogout = (): void => {
    clearSession();
    setUser(null);
    setIsLguAuthenticated(false);
    setLguAdminUsername('LGU Admin');
  };

  const appRoutes = (
    <Suspense
      fallback={(
        <div className="grid min-h-screen place-items-center bg-white text-slate-700">
          Loading portal...
        </div>
      )}
    >
      <Routes>
        <Route
          path="/lgu/login"
          element={
            hasLguSession ? (
              <Navigate to="/lgu/overview" replace />
            ) : (
              <LguLoginView onLogin={handleLguLogin} />
            )
          }
        />

        <Route path="/login" element={<Navigate to="/lgu/login" replace />} />

        <Route
          path="/enterprise/login"
          element={
            hasEnterpriseSession ? (
              <Navigate to="/enterprise/dashboard" replace />
            ) : (
              <LoginView onLogin={setUser} />
            )
          }
        />

        <Route
          path="/lgu"
          element={
            <ProtectedRoute isAllowed={hasLguSession}>
              <LguSidebarLayout
                onLogout={handleLguLogout}
                adminUsername={lguAdminUsername}
              />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<LguOverviewView />} />
          <Route path="map" element={<LguMapView />} />
          <Route
            path="enterprise-management"
            element={<LguEnterpriseManagementView />}
          />
          <Route path="enterprise-logs" element={<LguEnterpriseLogsView />} />
          <Route path="reports" element={<LguReportsWorkspaceView />} />
          <Route path="settings" element={<LguSettingsView />} />
        </Route>

        <Route path="/app/*" element={<Navigate to="/lgu/overview" replace />} />

        <Route
          path="/enterprise"
          element={
            <ProtectedRoute isAllowed={hasEnterpriseSession} redirectTo="/enterprise/login">
              <EnterpriseShell user={user as User} onLogout={handleLogout} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardView />} />
          <Route path="camera-monitoring" element={<CameraMonitoringView />} />
          <Route path="camera-logs" element={<CameraLogsView />} />
          <Route path="report-center" element={<ReportCenterView />} />
          <Route path="archived-reports" element={<ArchivedReportsView />} />
          <Route path="account" element={<AccountSettingsView />} />
        </Route>

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

  return isGitHubPagesHost
    ? <HashRouter>{appRoutes}</HashRouter>
    : <BrowserRouter>{appRoutes}</BrowserRouter>;
}
