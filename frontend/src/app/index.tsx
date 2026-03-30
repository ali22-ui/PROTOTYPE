import { useEffect, useState } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import {
  ENTERPRISE_SESSION_TOKEN_KEY,
  LGU_SESSION_TOKEN_KEY,
  clearSession,
  createClientSessionToken,
  getStoredUser,
} from '@/services/api';
import type { User } from '@/types';
import AppProviders from './providers';
import AppRoutes from './routes';

export default function App(): JSX.Element {
  const [user, setUser] = useState<User | null>(() => getStoredUser());
  const [isLguAuthenticated, setIsLguAuthenticated] = useState<boolean>(
    () => localStorage.getItem('lgu-auth') === 'true',
  );
  const [lguAdminUsername, setLguAdminUsername] = useState<string>(
    () => localStorage.getItem('lgu-auth-user') || 'LGU Admin',
  );

  const isGitHubPagesHost = globalThis.location.hostname.endsWith('github.io');

  const hasLguSession =
    isLguAuthenticated ||
    localStorage.getItem('lgu-auth') === 'true' ||
    Boolean(sessionStorage.getItem(LGU_SESSION_TOKEN_KEY));

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

  const handleEnterpriseLogout = (): void => {
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

  const routeContent = (
    <AppProviders>
      <AppRoutes
        user={user}
        hasLguSession={hasLguSession}
        hasEnterpriseSession={hasEnterpriseSession}
        lguAdminUsername={lguAdminUsername}
        onEnterpriseLogin={setUser}
        onLguLogin={handleLguLogin}
        onLguLogout={handleLguLogout}
        onEnterpriseLogout={handleEnterpriseLogout}
      />
    </AppProviders>
  );

  return isGitHubPagesHost ? (
    <HashRouter>{routeContent}</HashRouter>
  ) : (
    <BrowserRouter>{routeContent}</BrowserRouter>
  );
}
