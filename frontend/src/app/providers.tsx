import type { ReactNode } from 'react';

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Application-level providers wrapper.
 * Add React Query, authentication context, or other providers here as needed.
 */
export default function AppProviders({ children }: AppProvidersProps): JSX.Element {
  return <>{children}</>;
}
