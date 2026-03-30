import { useCallback, useEffect, useState } from 'react';
import { Archive, BellRing, Camera, ClipboardList, LayoutDashboard, LogOut, ScrollText, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { getReportingControlState, subscribePortalBridge } from '@/lib/portalBridge';
import { getComplianceStatusTheme, toReportingWindowStatus } from '@/lib/reportingStatus';
import type { LguReportingControlStatus, User } from '@/types';

const navItems: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/enterprise/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/enterprise/camera-monitoring', label: 'Camera Monitoring', icon: Camera },
  { to: '/enterprise/camera-logs', label: 'Camera Logs', icon: ClipboardList },
  { to: '/enterprise/report-center', label: 'Report Center', icon: ScrollText },
  { to: '/enterprise/archived-reports', label: 'Archived Reports', icon: Archive },
  { to: '/enterprise/account', label: 'Account', icon: Settings },
];

export interface EnterpriseOutletContext {
  user: User;
}

interface EnterpriseShellProps {
  user: User;
  onLogout: () => void;
}

export default function EnterpriseShell({ user, onLogout }: EnterpriseShellProps): JSX.Element {
  const [reportingNotice, setReportingNotice] = useState(() => getReportingControlState());

  const refreshReportingNotice = useCallback((): void => {
    setReportingNotice(getReportingControlState());
  }, []);

  useEffect(() => {
    refreshReportingNotice();
  }, [refreshReportingNotice]);

  useEffect(() => {
    return subscribePortalBridge(() => {
      refreshReportingNotice();
    });
  }, [refreshReportingNotice]);

  const isNoticeVisible = Boolean(
    reportingNotice
    && (reportingNotice.scope === 'ALL' || reportingNotice.enterpriseId === user.enterpriseId),
  );
  const noticeStatus: LguReportingControlStatus = reportingNotice?.status
    || (reportingNotice?.isOpen ? 'open' : 'closed');
  const noticeTheme = getComplianceStatusTheme(noticeStatus);

  return (
    <div className="flex h-screen overflow-hidden bg-white text-brand-dark">
      <aside className="sticky top-0 flex h-screen w-[280px] flex-shrink-0 flex-col overflow-hidden border-r border-[#79AE6F]/55 bg-brand-dark bg-gradient-to-b from-[#214f2a] via-[#1c4527] to-[#173a20] text-white shadow-2xl shadow-black/20">
        <div className="border-b border-[#79AE6F]/50 p-5">
          <p className="text-xs uppercase tracking-widest text-[#C7DFBD]">Enterprise Portal</p>
          <h1 className="mt-1 text-xl font-bold leading-tight">{user.companyName}</h1>
          <p className="mt-2 text-xs text-[#E8F2E4]/90">Permit: {user.businessPermit}</p>
        </div>

        <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'border-[#79AE6F]/70 bg-[#9FCB98] text-[#14351b] shadow-md shadow-black/20'
                      : 'border-transparent text-[#F2EDC2] hover:border-[#79AE6F]/50 hover:bg-[#79AE6F]/30 hover:text-[#F2EDC2]',
                  ].join(' ')
                }
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-[#79AE6F]/40 bg-black/10 p-4">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#79AE6F]/70 bg-[#9FCB98] px-4 py-2.5 text-sm font-semibold text-[#173a20] shadow-md shadow-black/15 transition hover:bg-[#F2EDC2] hover:text-[#14351b]"
          >
            <LogOut size={16} />
            LOG OUT
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-screen overflow-y-auto bg-white p-5 md:p-6 lg:p-7">
        {isNoticeVisible ? (
          <section
            className={`mb-4 flex items-start gap-2 rounded-2xl border px-4 py-3 shadow-sm ${noticeTheme.bannerClass}`}
          >
            <BellRing size={16} className="mt-0.5" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide">LGU Reporting Notice</p>
              <p className="text-sm font-medium">
                {reportingNotice?.message
                  || `${noticeTheme.title}.`}
              </p>
              <p className={`text-xs ${noticeTheme.subtleTextClass}`}>
                Period: {reportingNotice?.period} • Status: {toReportingWindowStatus(noticeStatus)}
              </p>
            </div>
          </section>
        ) : null}

        <Outlet context={{ user } satisfies EnterpriseOutletContext} />
      </main>
    </div>
  );
}
