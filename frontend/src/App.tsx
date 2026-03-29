import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import EnterpriseShell from '@/components/layout/EnterpriseShell';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import { clearSession, getStoredUser } from '@/services/api';
import type { User } from '@/types';
import LoginView from '@/views/LoginView';
import ArchivedReportsView from '@/views/enterprise/ArchivedReportsView';
import AccountSettingsView from './views/enterprise/AccountSettingsView';
import CameraLogsView from '@/views/enterprise/CameraLogsView';
import CameraMonitoringView from '@/views/enterprise/CameraMonitoringView';
import DashboardView from '@/views/enterprise/DashboardView';
import ReportCenterView from '@/views/enterprise/ReportCenterView';

const LguLoginView = lazy(() => import('@/features/auth/components/login-form'));
const LguDashboardLayout = lazy(() => import('@/components/layouts/dashboard-layout'));
const LguOverviewView = lazy(
  () => import('@/features/lgu/overview/components/overview-dashboard'),
);
const LguMapView = lazy(() => import('@/features/lgu/map/components/map-view'));
const LguEnterprisesView = lazy(
  () => import('@/features/lgu/enterprises/components/enterprises-list'),
);
const LguEnterpriseAnalyticsView = lazy(
  () => import('@/features/lgu/enterprises/components/enterprise-analytics'),
);
const LguReportsView = lazy(
  () => import('@/features/lgu/reports/components/reports-view'),
);
const LguLogsView = lazy(() => import('@/features/lgu/logs/components/logs-view'));
const LguSettingsView = lazy(
  () => import('@/features/lgu/settings/components/settings-view'),
);

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isLguAuthenticated, setIsLguAuthenticated] = useState<boolean>(
    () => localStorage.getItem('lgu-auth') === 'true',
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
  };

  const handleLguLogin = (): void => {
    localStorage.setItem('lgu-auth', 'true');
    setIsLguAuthenticated(true);
  };

  const handleLguLogout = (): void => {
    localStorage.removeItem('lgu-auth');
    setIsLguAuthenticated(false);
  };

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense
        fallback={(
          <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-700">
            Loading portal...
          </div>
        )}
      >
        <Routes>
          <Route
            path="/login"
            element={
              isLguAuthenticated ? (
                <Navigate to="/app/overview" replace />
              ) : (
                <LguLoginView onLogin={handleLguLogin} />
              )
            }
          />

          <Route
            path="/enterprise/login"
            element={
              user ? (
                <Navigate to="/enterprise/dashboard" replace />
              ) : (
                <LoginView onLogin={setUser} />
              )
            }
          />

          <Route
            path="/app"
            element={
              isLguAuthenticated ? (
                <LguDashboardLayout onLogout={handleLguLogout} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          >
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<LguOverviewView />} />
            <Route path="map" element={<LguMapView />} />
            <Route path="enterprises" element={<LguEnterprisesView />} />
            <Route
              path="enterprise/:enterpriseId"
              element={<LguEnterpriseAnalyticsView />}
            />
            <Route path="reports" element={<LguReportsView />} />
            <Route path="logs" element={<LguLogsView />} />
            <Route path="settings" element={<LguSettingsView />} />
          </Route>

          <Route
            path="/enterprise"
            element={
              <ProtectedRoute user={user} redirectTo="/enterprise/login">
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
                  user
                    ? '/enterprise/dashboard'
                    : isLguAuthenticated
                      ? '/app/overview'
                      : '/enterprise/login'
                }
                replace
              />
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
