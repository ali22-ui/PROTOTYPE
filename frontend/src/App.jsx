import { Navigate, Route, Routes } from 'react-router-dom';
import { lazy, Suspense, useMemo, useState } from 'react';

const LoginView = lazy(() => import('./views/LoginView'));
const SignUpView = lazy(() => import('./views/SignUpView'));
const DashboardLayout = lazy(() => import('./components/DashboardLayout'));
const OverviewView = lazy(() => import('./views/OverviewView'));
const MapView = lazy(() => import('./views/MapView'));
const EnterpriseAnalyticsView = lazy(() => import('./views/EnterpriseAnalyticsView'));
const EnterprisesView = lazy(() => import('./views/EnterprisesView'));
const ReportsView = lazy(() => import('./views/ReportsView'));
const SettingsView = lazy(() => import('./views/SettingsView'));
const LogsView = lazy(() => import('./views/LogsView'));
const EnterprisePortalView = lazy(() => import('./views/EnterprisePortalView'));
const EnterpriseLoginView = lazy(() => import('./views/EnterpriseLoginView'));
const EnterpriseDashboardLayout = lazy(() => import('./components/EnterpriseDashboardLayout'));
const EnterpriseCameraView = lazy(() => import('./views/EnterpriseCameraView'));
const EnterpriseReportsView = lazy(() => import('./views/EnterpriseReportsView'));
const EnterpriseRecommendationsView = lazy(() => import('./views/EnterpriseRecommendationsView'));

function ProtectedRoute({ isAuthenticated, children, redirectTo = '/login' }) {
  if (!isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}

export default function App() {
  const [isLguAuthenticated, setIsLguAuthenticated] = useState(
    localStorage.getItem('lgu-auth') === 'true'
  );
  const [isEnterpriseAuthenticated, setIsEnterpriseAuthenticated] = useState(
    localStorage.getItem('enterprise-auth') === 'true'
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
    []
  );

  const enterpriseAuth = useMemo(
    () => ({
      login: (enterpriseAccount) => {
        if (enterpriseAccount?.enterprise_id) {
          localStorage.setItem('enterprise-account-id', enterpriseAccount.enterprise_id);
          localStorage.setItem('enterprise-account-name', enterpriseAccount.company_name || 'Enterprise Account');
          if (enterpriseAccount.logo_url) {
            localStorage.setItem('enterprise-account-logo', enterpriseAccount.logo_url);
          }
          if (enterpriseAccount.theme) {
            localStorage.setItem('enterprise-account-theme', JSON.stringify(enterpriseAccount.theme));
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
    []
  );

  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center bg-slate-100 text-slate-700">Loading portal...</div>}>
      <Routes>
        <Route
          path="/login"
          element={
            isLguAuthenticated ? <Navigate to="/app/overview" replace /> : <LoginView onLogin={lguAuth.login} />
          }
        />
        <Route
          path="/signup"
          element={
            isLguAuthenticated ? <Navigate to="/app/overview" replace /> : <SignUpView onRegister={lguAuth.login} />
          }
        />

        <Route
          path="/enterprise/login"
          element={
            isEnterpriseAuthenticated ? (
              <Navigate to="/enterprise/dashboard" replace />
            ) : (
              <EnterpriseLoginView onLogin={enterpriseAuth.login} />
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
          <Route path="overview" element={<OverviewView />} />
          <Route path="map" element={<MapView />} />
          <Route path="enterprise/:enterpriseId" element={<EnterpriseAnalyticsView />} />
          <Route path="enterprises" element={<EnterprisesView />} />
          <Route path="reports" element={<ReportsView />} />
          <Route path="logs" element={<LogsView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>

        <Route
          path="/enterprise"
          element={
            <ProtectedRoute isAuthenticated={isEnterpriseAuthenticated} redirectTo="/enterprise/login">
              <EnterpriseDashboardLayout onLogout={enterpriseAuth.logout} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<EnterprisePortalView />} />
          <Route path="camera" element={<EnterpriseCameraView />} />
          <Route path="reports" element={<EnterpriseReportsView />} />
          <Route path="recommendations" element={<EnterpriseRecommendationsView />} />
        </Route>

        <Route path="/app/enterprise-portal" element={<Navigate to="/enterprise/dashboard" replace />} />

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
