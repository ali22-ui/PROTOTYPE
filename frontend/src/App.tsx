import { useEffect, useState } from 'react';
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

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(() => getStoredUser());

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

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/enterprise/dashboard" replace /> : <LoginView onLogin={setUser} />}
        />

        <Route
          path="/enterprise"
          element={
            <ProtectedRoute user={user} redirectTo="/login">
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
          element={<Navigate to={user ? '/enterprise/dashboard' : '/login'} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
