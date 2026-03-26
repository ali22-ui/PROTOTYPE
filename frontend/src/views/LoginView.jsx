import { Link, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';

export default function LoginView({ onLogin }) {
  const navigate = useNavigate();

  const handleSubmit = (event) => {
    event.preventDefault();
    onLogin();
    navigate('/app/overview');
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-200 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:grid-cols-[320px_1fr]">
        <div className="flex flex-col justify-between bg-primary-900 p-8 text-white">
          <div>
            <div className="mb-4 inline-flex rounded-xl bg-white/10 p-3 ring-1 ring-white/20">
              <ShieldCheck size={28} />
            </div>
            <h1 className="text-2xl font-bold leading-tight">LGU San Pedro City</h1>
            <p className="mt-2 text-sm text-blue-100">Portal Access</p>
          </div>

          <div className="rounded-xl border border-white/20 bg-white/5 p-4 text-xs text-blue-100">
            Secure access to tourism, enterprise, and barangay analytics for San Pedro City, Laguna 4023.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-10">
          <h2 className="text-xl font-bold text-slate-800">Sign In</h2>
          <p className="mt-2 text-sm text-slate-500">Use your LGU credentials to continue.</p>

          <label className="mt-6 block text-sm font-medium text-slate-700">Username</label>
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-primary-600 focus:outline-none" required />

          <label className="mt-4 block text-sm font-medium text-slate-700">Password</label>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-primary-600 focus:outline-none"
            required
          />

          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-primary-500 px-4 py-2.5 font-semibold text-white transition hover:bg-primary-700"
          >
            Log In
          </button>

          <p className="mt-4 text-center text-sm text-slate-600">
            No Account?{' '}
            <Link to="/signup" className="font-semibold text-primary-600 hover:underline">
              Register here
            </Link>
            .
          </p>
        </form>
      </div>
    </div>
  );
}
