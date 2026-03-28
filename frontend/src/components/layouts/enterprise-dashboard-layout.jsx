import { NavLink, Outlet } from 'react-router-dom';
import {
  Bell,
  Camera,
  Lightbulb,
  LogOut,
  UserCircle2,
  LayoutDashboard,
  ScrollText,
} from 'lucide-react';

const navLinks = [
  { to: '/enterprise/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/enterprise/camera', label: 'Camera Monitoring', icon: Camera },
  { to: '/enterprise/reports', label: 'Reports Center', icon: ScrollText },
  {
    to: '/enterprise/recommendations',
    label: 'AI Recommendations',
    icon: Lightbulb,
  },
];

export default function EnterpriseDashboardLayout({ onLogout }) {
  const accountName =
    localStorage.getItem('enterprise-account-name') || 'Enterprise Account';
  const accountLogo =
    localStorage.getItem('enterprise-account-logo') ||
    'https://placehold.co/72x72/1d4ed8/FFFFFF?text=EA';
  const theme = JSON.parse(
    localStorage.getItem('enterprise-account-theme') ||
      '{"sidebar":"#0f172a","accent":"#1d4ed8","surface":"#edf2f7"}',
  );

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: theme.surface || '#edf2f7' }}
    >
      <div className="grid min-h-screen grid-cols-[220px_1fr]">
        <aside
          className="flex flex-col text-white shadow-xl"
          style={{ backgroundColor: theme.sidebar || '#0f172a' }}
        >
          <div className="border-b border-slate-700 px-4 py-5">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-300">
              Enterprise System
            </div>
            <div className="flex items-center gap-2">
              <img
                src={accountLogo}
                alt={`${accountName} logo`}
                className="h-9 w-9 rounded-md border border-white/30 object-cover"
              />
              <h1 className="text-[22px] font-semibold leading-7">
                {accountName} Portal
              </h1>
            </div>
          </div>

          <nav className="flex-1 space-y-1.5 px-2 py-4">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[15px] transition ${
                    isActive
                      ? 'text-white shadow'
                      : 'text-slate-200 hover:bg-slate-800'
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? { backgroundColor: theme.accent || '#1d4ed8' }
                    : undefined
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-slate-700 p-2">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] text-slate-200 transition hover:bg-slate-800"
            >
              <LogOut size={16} />
              Log Out
            </button>
          </div>
        </aside>

        <main className="flex flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
            <h2 className="text-[30px] font-semibold tracking-tight text-slate-800">
              Enterprise Dashboard
            </h2>
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-slate-200 p-2 text-slate-600">
                <Bell size={16} />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <UserCircle2
                  size={18}
                  style={{ color: theme.accent || '#1d4ed8' }}
                />
                <div>
                  <p className="text-xs text-slate-500">Enterprise Admin</p>
                  <p className="text-sm font-semibold leading-4">
                    {accountName}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 p-4">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
