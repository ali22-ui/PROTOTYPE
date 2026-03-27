import { NavLink, Outlet } from 'react-router-dom';
import {
  Building2,
  LayoutDashboard,
  Map,
  Settings,
  FileBarChart2,
  ScrollText,
  LogOut,
  Search,
  UserCircle2,
  Shield,
} from 'lucide-react';

const navLinks = [
  { to: '/app/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/app/map', label: 'Map View', icon: Map },
  { to: '/app/enterprises', label: 'Enterprises', icon: Building2 },
  { to: '/app/reports', label: 'Reports', icon: FileBarChart2 },
  { to: '/app/logs', label: 'Logs', icon: ScrollText },
];

export default function DashboardLayout({ onLogout }) {
  return (
    <div className="min-h-screen bg-[#edf2f7]">
      <div className="grid min-h-screen grid-cols-[236px_1fr]">
        <aside className="flex flex-col bg-primary-900 text-white shadow-xl">
          <div className="border-b border-blue-800 px-4 py-4.5">
            <div className="flex items-center gap-3">
              <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-700 ring-2 ring-white/20 shadow-lg shadow-blue-900/35">
                <Shield size={18} className="absolute top-2.5 text-white/95" />
                <span className="mt-3 text-[10px] font-black tracking-wide text-white">LGU</span>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-blue-200">San Pedro City</div>
                <h1 className="text-lg font-extrabold leading-tight tracking-[0.05em] text-white">LGU DASHBOARD</h1>
                <p className="text-[10px] uppercase tracking-[0.14em] text-blue-200/90">Laguna • Command Center</p>
              </div>
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
                      ? 'bg-gradient-to-r from-blue-700 to-blue-600 text-white shadow'
                      : 'text-blue-100 hover:bg-blue-800'
                  }`
                }
              >
                <Icon size={17} />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="space-y-1.5 border-t border-blue-800 p-2">
            <NavLink
              to="/app/settings"
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] transition ${
                  isActive ? 'bg-blue-700 text-white' : 'text-blue-100 hover:bg-blue-800'
                }`
              }
            >
              <Settings size={16} />
              Settings
            </NavLink>
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] text-blue-100 transition hover:bg-blue-800"
            >
              <LogOut size={16} />
              Log Out
            </button>
          </div>
        </aside>

        <main className="flex flex-col">
          <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5">
            <h2 className="text-[32px] font-semibold tracking-tight text-slate-800">Dashboard</h2>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <Search size={16} className="text-slate-500" />
                <input
                  className="w-52 bg-transparent text-sm outline-none"
                  placeholder="Search enterprises or barangays"
                />
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                <UserCircle2 size={18} className="text-primary-500" />
                <div>
                  <p className="text-xs text-slate-500">LGU Admin</p>
                  <p className="text-sm font-semibold leading-4">San Pedro</p>
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 p-5">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
