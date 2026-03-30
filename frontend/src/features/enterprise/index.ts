// Enterprise Feature Module
// Re-exports all public API for the Enterprise feature

// Shell/Layout component (shared)
export { default as EnterpriseShell } from '@/components/layout/EnterpriseShell';

// Page components (from views folder)
export { default as DashboardPage } from '@/views/enterprise/DashboardView';
export { default as CameraMonitoringPage } from '@/views/enterprise/CameraMonitoringView';
export { default as CameraLogsPage } from '@/views/enterprise/CameraLogsView';
export { default as ReportCenterPage } from '@/views/enterprise/ReportCenterView';
export { default as ArchivedReportsPage } from '@/views/enterprise/ArchivedReportsView';
export { default as AccountSettingsPage } from '@/views/enterprise/AccountSettingsView';

// Camera sub-feature
export * from './camera';
