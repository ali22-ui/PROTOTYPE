import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { fetchEnterpriseAccounts } from '../api/auth';

export default function EnterpriseLoginForm({ onLogin }) {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState('');

  const selectedAccount =
    accounts.find((item) => item.enterprise_id === selectedId) || accounts[0];

  useEffect(() => {
    fetchEnterpriseAccounts()
      .then((result) => {
        const rows = result.accounts || [];
        setAccounts(rows);
        if (rows.length > 0) {
          setSelectedId(rows[0].enterprise_id);
        }
      })
      .catch((error) => {
        console.error('Failed to load enterprise accounts:', error);
      });
  }, []);

  const handleSubmit = (event) => {
    event.preventDefault();
    onLogin(selectedAccount);
    navigate('/enterprise/dashboard');
  };

  return (
    <div className="grid min-h-screen place-items-center bg-slate-200 p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:grid-cols-[320px_1fr]">
        <div className="flex flex-col justify-between bg-slate-900 p-8 text-white">
          <div>
            <div className="mb-4 inline-flex rounded-xl bg-white/10 p-3 ring-1 ring-white/20">
              <Building2 size={28} />
            </div>
            <h1 className="text-2xl font-bold leading-tight">
              {selectedAccount?.company_name || 'Enterprise'} Portal
            </h1>
            <p className="mt-2 text-sm text-slate-200">
              Tourism Analytics Access
            </p>
            {selectedAccount?.logo_url ? (
              <img
                src={selectedAccount.logo_url}
                alt={`${selectedAccount.company_name} logo`}
                className="mt-4 h-14 w-14 rounded-lg border border-white/30 object-cover"
              />
            ) : null}
          </div>

          <div className="rounded-xl border border-white/20 bg-white/5 p-4 text-xs text-slate-200">
            Separate enterprise system for AI analytics and month-end report
            submission to linked LGU account.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-10">
          <h2 className="text-xl font-bold text-slate-800">
            Enterprise Sign In
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Use enterprise credentials to access your reporting dashboard.
          </p>

          <label className="mt-6 block text-sm font-medium text-slate-700">
            Select Enterprise Account
          </label>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-primary-600 focus:outline-none"
            required
          >
            {accounts.map((account) => (
              <option key={account.enterprise_id} value={account.enterprise_id}>
                {account.company_name} ({account.enterprise_id})
              </option>
            ))}
          </select>

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Enterprise Username
          </label>
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-primary-600 focus:outline-none"
            required
          />

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 focus:border-primary-600 focus:outline-none"
            required
          />

          <button
            type="submit"
            className="mt-6 w-full rounded-lg bg-primary-500 px-4 py-2.5 font-semibold text-white transition hover:bg-primary-700"
          >
            Log In to Enterprise System
          </button>
        </form>
      </div>
    </div>
  );
}
