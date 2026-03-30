import { useEffect, useState } from 'react';
import { Building2, KeyRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '@/services/api';
import type { User } from '@/types';

interface LoginViewProps {
  onLogin: (user: User) => void;
}

export default function LoginView({ onLogin }: LoginViewProps): JSX.Element {
  const navigate = useNavigate();
  const [businessPermit, setBusinessPermit] = useState('ent_archies_001');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Enterprise Management';

    return () => {
      document.title = previousTitle;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const user = await login({ businessPermit, password });
      onLogin(user);
      navigate('/enterprise/dashboard', { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-brand-dark via-brand-mid to-brand-dark p-4">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-brand-mid/45 bg-brand-dark/50 shadow-2xl backdrop-blur md:grid-cols-[360px_1fr]">
        <section className="flex flex-col justify-between bg-brand-dark/80 p-8 text-brand-cream">
          <div>
            <div className="inline-flex rounded-2xl bg-brand-mid/25 p-3 ring-1 ring-brand-mid/45">
              <Building2 size={30} />
            </div>
            <h1 className="mt-4 text-3xl font-bold leading-tight">Enterprise Management</h1>
            <p className="mt-3 text-sm text-brand-cream/90">
              Sign in with your business permit account to access Dashboard, Camera Monitoring, Camera Logs,
              Report Center, and Archived Reports.
            </p>
          </div>

          <div className="rounded-2xl border border-brand-mid/40 bg-brand-mid/20 p-4 text-xs text-brand-cream/90">
            Tip: Use an existing enterprise ID (example: <span className="font-semibold">ent_archies_001</span>) as
            your Business Permit value.
          </div>
        </section>

        <section className="bg-white p-8 md:p-10">
          <h2 className="text-2xl font-bold text-brand-dark">Login</h2>
          <p className="mt-1 text-sm text-slate-500">Secure access to enterprise analytics and LGU report workflows.</p>
          <p className="mt-2 text-xs text-slate-500">
            LGU Admin?{' '}
            <Link to="/lgu/login" className="font-semibold text-brand-dark hover:underline">
              Go to LGU Login
            </Link>
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Business Permit (Username)</span>
              <input
                type="text"
                value={businessPermit}
                onChange={(event) => setBusinessPermit(event.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-brand-mid focus:bg-white"
                placeholder="Enter business permit username"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-700">Password</span>
              <div className="relative mt-2">
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 pr-10 text-sm outline-none transition focus:border-brand-mid focus:bg-white"
                  placeholder="Enter password"
                />
                <KeyRound className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              </div>
            </label>

            {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-brand-dark px-4 py-3 text-sm font-semibold text-brand-cream transition hover:bg-brand-mid disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
