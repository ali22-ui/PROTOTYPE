declare module '@/features/auth/components/login-form' {
  import type { ComponentType } from 'react';
  const Component: ComponentType<{ onLogin: () => void }>;
  export default Component;
}

declare module '@/components/layouts/dashboard-layout' {
  import type { ComponentType } from 'react';
  const Component: ComponentType<{ onLogout: () => void }>;
  export default Component;
}

declare module '@/features/lgu/overview/components/overview-dashboard' {
  import type { ComponentType } from 'react';
  const Component: ComponentType;
  export default Component;
}

declare module '@/features/lgu/map/components/map-view' {
  import type { ComponentType } from 'react';
  const Component: ComponentType;
  export default Component;
}

declare module '@/features/lgu/enterprises/components/enterprises-list' {
  import type { ComponentType } from 'react';
  const Component: ComponentType;
  export default Component;
}

declare module '@/features/lgu/enterprises/components/enterprise-analytics' {
  import type { ComponentType } from 'react';
  const Component: ComponentType;
  export default Component;
}

declare module '@/features/lgu/reports/components/reports-view' {
  import type { ComponentType } from 'react';
  const Component: ComponentType;
  export default Component;
}

declare module '@/features/lgu/logs/components/logs-view' {
  import type { ComponentType } from 'react';
  const Component: ComponentType;
  export default Component;
}

declare module '@/features/lgu/settings/components/settings-view' {
  import type { ComponentType } from 'react';
  const Component: ComponentType;
  export default Component;
}
