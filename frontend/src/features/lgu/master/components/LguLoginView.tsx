import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

interface LguLoginViewProps {
  onLogin: (username: string) => void;
}

export default function LguLoginView({ onLogin }: LguLoginViewProps): JSX.Element {
  const navigate = useNavigate();
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const lguLogoUrl = `${import.meta.env.BASE_URL}San_Pedro_City.png`;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onLogin(username.trim());
    navigate('/lgu/overview', { replace: true });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-brand-cream p-4">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-brand-light bg-white shadow-2xl md:grid-cols-[360px_1fr]">
        <section className="flex min-h-full flex-col justify-between bg-brand-dark p-8 text-brand-cream">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <img
                src={lguLogoUrl}
                alt="San Pedro City logo"
                className="h-16 w-16 rounded-full border border-brand-light/40 bg-white object-cover"
              />
              <span className="inline-flex rounded-2xl bg-brand-light/20 p-3 ring-1 ring-brand-light/40">
                <ShieldCheck size={30} />
              </span>
            </div>
            <h1 className="text-3xl font-black leading-tight tracking-tight">
              LGU MASTER
              <br />
              PORTAL
            </h1>
            <p className="mt-2 text-sm text-brand-cream/90">
              San Pedro City, Laguna 4023
            </p>
          </div>

          <div className="rounded-2xl border border-brand-light/30 bg-brand-mid/20 p-4 text-sm text-brand-cream/90">
            Government-only console for city-wide enterprise oversight, compliance tracking,
            map intelligence, and report management.
          </div>
        </section>

        <form onSubmit={handleSubmit} className="flex min-h-full flex-col justify-center p-8 md:p-10">
          <h2 className="text-2xl font-bold text-brand-dark">Sign in to LGU Portal</h2>
          <p className="mt-2 text-sm text-slate-600">
            Enter your LGU admin username and password to continue.
          </p>

          <label htmlFor="lgu-username" className="mt-6 text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="lgu-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="mt-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-mid focus:outline-none"
            required
          />

          <label htmlFor="lgu-password" className="mt-4 text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="lgu-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            className="mt-1 rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-mid focus:outline-none"
            required
          />

          <button
            type="submit"
            className="mt-6 rounded-xl bg-brand-dark px-4 py-3 text-sm font-semibold text-brand-cream transition hover:bg-brand-mid disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!username.trim() || !password.trim()}
          >
            Login to LGU Dashboard
          </button>

          <p className="mt-4 text-center text-sm text-slate-600">
            Enterprise user?{' '}
            <Link to="/enterprise/login" className="font-semibold text-brand-dark hover:underline">
              Go to Enterprise Login
            </Link>
            .
          </p>
        </form>
      </div>
    </div>
  );
}
