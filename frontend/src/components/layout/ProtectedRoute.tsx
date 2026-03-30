import { Navigate } from 'react-router-dom';
import type { ReactElement } from 'react';

interface ProtectedRouteProps {
  isAllowed: boolean;
  children: ReactElement;
  redirectTo?: string;
}

export default function ProtectedRoute({
  isAllowed,
  children,
  redirectTo = '/login',
}: ProtectedRouteProps): ReactElement {
  if (!isAllowed) {
    return <Navigate to={redirectTo} replace />;
  }

  return children;
}
