import { Link, useNavigate } from 'react-router-dom';

export default function SignUpView({ onRegister }) {
  const navigate = useNavigate();

  const handleSubmit = (event) => {
    event.preventDefault();
    onRegister();
    navigate('/app/overview');
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-800">Create New Account</h1>
        <p className="mt-2 text-sm text-slate-500">Register for access to LGU business and tourism analytics.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Full Name</label>
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-primary-600 focus:outline-none" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Username</label>
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-primary-600 focus:outline-none" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Business/LGU ID</label>
            <input className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-primary-600 focus:outline-none" required />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input type="email" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-primary-600 focus:outline-none" required />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-primary-600 focus:outline-none"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="mt-6 w-full rounded-xl bg-primary-500 px-4 py-2 font-semibold text-white transition hover:bg-primary-700"
        >
          Register
        </button>

        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary-600 hover:underline">
            Log In
          </Link>
          .
        </p>
      </form>
    </div>
  );
}
