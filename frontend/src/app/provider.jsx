import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ErrorBoundary } from '@/components/errors';

const Router = window.location.hostname.includes('github.io')
  ? HashRouter
  : BrowserRouter;

export default function Provider({ children }) {
  return (
    <ErrorBoundary>
      <Router>{children}</Router>
    </ErrorBoundary>
  );
}
