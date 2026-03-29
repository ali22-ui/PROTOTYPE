import { Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';
import type { User } from '@/types';

interface ProtectedRouteProps {
  user: User | null;
  children: ReactElement;
  redirectTo?: string;
}

export default function ProtectedRoute({
  user,
  children,
  redirectTo = '/login',
}: ProtectedRouteProps): ReactElement {
  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
