import { useEffect, useMemo } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BellRing,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Map,
  Settings,
  type LucideIcon,
} from 'lucide-react';

interface LguSidebarLayoutProps {
  onLogout: () => void;
  adminUsername: string;
}

interface LguNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const navItems: LguNavItem[] = [
  { to: '/lgu/overview', label: 'Overview', icon: LayoutDashboard },
  { to: '/lgu/map', label: 'Map View', icon: Map },
  {
    to: '/lgu/enterprise-management',
    label: 'Enterprise Management',
    icon: Building2,
  },
  { to: '/lgu/enterprise-logs', label: 'Enterprise Logs', icon: BellRing },
  { to: '/lgu/reports', label: 'Reports', icon: FileText },
  { to: '/lgu/settings', label: 'Settings', icon: Settings },
];

const routeTitleMap: Record<string, string> = {
  '/lgu/overview': 'Overview',
  '/lgu/map': 'Map View',
  '/lgu/enterprise-management': 'Enterprise Management',
  '/lgu/enterprise-logs': 'Enterprise Logs',
  '/lgu/reports': 'Reports',
  '/lgu/settings': 'Settings',
};

export default function LguSidebarLayout({
  onLogout,
  adminUsername,
}: LguSidebarLayoutProps): JSX.Element {
  const location = useLocation();
  const lguLogoUrl = `${import.meta.env.BASE_URL}San_Pedro_City.png`;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'LGU PORTAL';

    return () => {
      document.title = previousTitle;
    };
  }, []);

  const currentTitle = useMemo<string>(() => {
    return routeTitleMap[location.pathname] || 'LGU Master Portal';
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-brand-cream text-brand-dark">
      <div className="grid min-h-screen grid-cols-[280px_1fr]">
        <aside className="sticky top-0 flex h-screen flex-col border-r border-brand-light/60 bg-brand-dark px-3 py-4 text-brand-cream shadow-xl">
          <div className="rounded-2xl border border-brand-light/40 bg-brand-mid/20 px-4 py-4">
            <div className="flex items-center gap-3">
              <img
                src={lguLogoUrl}
                alt="San Pedro City logo"
                className="h-14 w-14 rounded-full border border-brand-light/50 bg-white object-cover"
              />
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-brand-cream/80">
                  San Pedro City
                </p>
                <h1 className="mt-1 text-xl font-black leading-tight tracking-tight">LGU PORTAL</h1>
                <p className="mt-1 text-xs text-brand-cream/80">Master Admin Dashboard • Laguna 4023</p>
              </div>
            </div>
          </div>

          <nav className="mt-4 flex flex-1 flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-brand-light text-brand-dark shadow-sm'
                        : 'text-brand-cream/90 hover:bg-brand-mid/35'
                    }`
                  }
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}

            <button
              type="button"
              onClick={onLogout}
              className="mt-auto flex items-center gap-2.5 rounded-xl border border-brand-light/40 px-3 py-2.5 text-sm font-semibold text-brand-cream transition hover:bg-brand-mid/35"
            >
              <LogOut size={16} />
              Logout
            </button>
          </nav>
        </aside>

        <main className="flex min-h-screen flex-col">
          <header className="border-b border-brand-light/60 bg-white/85 px-6 py-4 backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-brand-dark">{currentTitle}</h2>
                <p className="text-sm text-slate-600">City-wide LGU oversight for all connected enterprises</p>
              </div>
              <div className="rounded-xl border border-brand-light bg-brand-cream px-3 py-2 text-right">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Signed in as</p>
                <p className="text-sm font-semibold text-brand-dark">{adminUsername || 'LGU Admin'}</p>
              </div>
            </div>
          </header>

          <section className="grid flex-1 p-5">
            <Outlet />
          </section>
        </main>
      </div>
    </div>
  );
}
