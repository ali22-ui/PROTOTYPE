import { lazy, Suspense, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './protected-route';

const LoginForm = lazy(() => import('@/features/auth/components/login-form'));
const SignupForm = lazy(() => import('@/features/auth/components/signup-form'));
const EnterpriseLoginForm = lazy(
  () => import('@/features/auth/components/enterprise-login-form'),
);
const DashboardLayout = lazy(
  () => import('@/components/layouts/dashboard-layout'),
);
const EnterpriseDashboardLayout = lazy(
  () => import('@/components/layouts/enterprise-dashboard-layout'),
);
const OverviewDashboard = lazy(
  () => import('@/features/lgu/overview/components/overview-dashboard'),
);
const MapView = lazy(() => import('@/features/lgu/map/components/map-view'));
const EnterprisesList = lazy(
  () => import('@/features/lgu/enterprises/components/enterprises-list'),
);
const EnterpriseAnalytics = lazy(
  () => import('@/features/lgu/enterprises/components/enterprise-analytics'),
);
const ReportsView = lazy(
  () => import('@/features/lgu/reports/components/reports-view'),
);
const LogsView = lazy(() => import('@/features/lgu/logs/components/logs-view'));
const SettingsView = lazy(
  () => import('@/features/lgu/settings/components/settings-view'),
);
const EnterpriseDashboard = lazy(
  () =>
    import('@/features/enterprise/dashboard/components/enterprise-dashboard'),
);
const CameraView = lazy(
  () => import('@/features/enterprise/camera/components/camera-page'),
);
const EnterpriseReportsView = lazy(
  () => import('@/features/enterprise/reports/components/reports-view'),
);
const RecommendationsView = lazy(
  () =>
    import('@/features/enterprise/recommendations/components/recommendations-view'),
);

export default function AppRoutes() {
  const [isLguAuthenticated, setIsLguAuthenticated] = useState(
    localStorage.getItem('lgu-auth') === 'true',
  );
  const [isEnterpriseAuthenticated, setIsEnterpriseAuthenticated] = useState(
    localStorage.getItem('enterprise-auth') === 'true',
  );

  const lguAuth = useMemo(
    () => ({
      login: () => {
        localStorage.setItem('lgu-auth', 'true');
        setIsLguAuthenticated(true);
      },
      logout: () => {
        localStorage.removeItem('lgu-auth');
        setIsLguAuthenticated(false);
      },
    }),
    [],
  );

  const enterpriseAuth = useMemo(
    () => ({
      login: (enterpriseAccount) => {
        if (enterpriseAccount?.enterprise_id) {
          localStorage.setItem(
            'enterprise-account-id',
            enterpriseAccount.enterprise_id,
          );
          localStorage.setItem(
            'enterprise-account-name',
            enterpriseAccount.company_name || 'Enterprise Account',
          );
          if (enterpriseAccount.logo_url) {
            localStorage.setItem(
              'enterprise-account-logo',
              enterpriseAccount.logo_url,
            );
          }
          if (enterpriseAccount.theme) {
            localStorage.setItem(
              'enterprise-account-theme',
              JSON.stringify(enterpriseAccount.theme),
            );
          }
        }
        localStorage.setItem('enterprise-auth', 'true');
        setIsEnterpriseAuthenticated(true);
      },
      logout: () => {
        localStorage.removeItem('enterprise-auth');
        localStorage.removeItem('enterprise-account-id');
        localStorage.removeItem('enterprise-account-name');
        localStorage.removeItem('enterprise-account-logo');
        localStorage.removeItem('enterprise-account-theme');
        setIsEnterpriseAuthenticated(false);
      },
    }),
    [],
  );

  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-700">
          Loading portal...
        </div>
      }
    >
      <Routes>
        <Route
          path="/login"
          element={
            isLguAuthenticated ? (
              <Navigate to="/app/overview" replace />
            ) : (
              <LoginForm onLogin={lguAuth.login} />
            )
          }
        />
        <Route
          path="/signup"
          element={
            isLguAuthenticated ? (
              <Navigate to="/app/overview" replace />
            ) : (
              <SignupForm onRegister={lguAuth.login} />
            )
          }
        />

        <Route
          path="/enterprise/login"
          element={
            isEnterpriseAuthenticated ? (
              <Navigate to="/enterprise/dashboard" replace />
            ) : (
              <EnterpriseLoginForm onLogin={enterpriseAuth.login} />
            )
          }
        />

        <Route
          path="/app"
          element={
            <ProtectedRoute isAuthenticated={isLguAuthenticated}>
              <DashboardLayout onLogout={lguAuth.logout} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="overview" replace />} />
          <Route path="overview" element={<OverviewDashboard />} />
          <Route path="map" element={<MapView />} />
          <Route
            path="enterprise/:enterpriseId"
            element={<EnterpriseAnalytics />}
          />
          <Route path="enterprises" element={<EnterprisesList />} />
          <Route path="reports" element={<ReportsView />} />
          <Route path="logs" element={<LogsView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>

        <Route
          path="/enterprise"
          element={
            <ProtectedRoute
              isAuthenticated={isEnterpriseAuthenticated}
              redirectTo="/enterprise/login"
            >
              <EnterpriseDashboardLayout onLogout={enterpriseAuth.logout} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<EnterpriseDashboard />} />
          <Route path="camera" element={<CameraView />} />
          <Route path="reports" element={<EnterpriseReportsView />} />
          <Route path="recommendations" element={<RecommendationsView />} />
        </Route>

        <Route
          path="/app/enterprise-portal"
          element={<Navigate to="/enterprise/dashboard" replace />}
        />

        <Route
          path="*"
          element={
            <Navigate
              to={
                isLguAuthenticated
                  ? '/app/overview'
                  : isEnterpriseAuthenticated
                    ? '/enterprise/dashboard'
                    : '/login'
              }
              replace
            />
          }
        />
      </Routes>
    </Suspense>
  );
}
