import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchEnterprises } from '../services/api';

export default function EnterprisesView() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');

  useEffect(() => {
    fetchEnterprises()
      .then((data) => {
        setRows(data.enterprises);
      })
      .catch((error) => {
        console.error('Failed to load enterprises:', error);
      });
  }, []);

  const types = useMemo(() => ['All', ...new Set(rows.map((r) => r.type))], [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch =
        row.name.toLowerCase().includes(search.toLowerCase()) ||
        row.barangay.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'All' || row.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [rows, search, typeFilter]);

  const statusStats = useMemo(() => {
    const active = rows.filter((entry) => entry.status === 'Active').length;
    const review = rows.filter((entry) => entry.status === 'Under Review').length;
    const renewal = rows.filter((entry) => entry.status === 'Pending Renewal').length;
    return { active, review, renewal };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">San Pedro Registry</p>
          <p className="mt-2 text-3xl font-bold text-primary-900">{rows.length}</p>
          <p className="text-sm text-slate-600">Total establishments city-wide</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700">{statusStats.active}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">For Review/Renewal</p>
          <p className="mt-2 text-2xl font-bold text-amber-700">{statusStats.review + statusStats.renewal}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">Registered Businesses</h3>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {filteredRows.length} filtered
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by business or barangay"
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-600 focus:outline-none"
          />

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-primary-600 focus:outline-none"
          >
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5">Business Name</th>
                <th className="px-3 py-2.5">Barangay</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={row.id} className={`border-t border-slate-100 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                  <td className="px-3 py-2.5 font-medium text-slate-700">{row.name}</td>
                  <td className="px-3 py-2.5">{row.barangay}</td>
                  <td className="px-3 py-2.5">{row.type}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        row.status === 'Active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : row.status === 'Under Review'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => navigate(`/app/enterprise/${row.id}`)}
                      className="rounded-md bg-primary-600 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
