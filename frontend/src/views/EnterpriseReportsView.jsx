import { useEffect, useState } from 'react';
import { Clock3, FileCheck2 } from 'lucide-react';
import { fetchEnterpriseProfile, fetchEnterpriseReportHistory, fetchReportingWindowStatus, submitEnterpriseReport } from '../services/api';

export default function EnterpriseReportsView() {
  const [profile, setProfile] = useState(null);
  const [windowState, setWindowState] = useState(null);
  const [history, setHistory] = useState([]);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reload = async () => {
    const profileData = await fetchEnterpriseProfile();
    const [windowData, historyData] = await Promise.all([
      fetchReportingWindowStatus(),
      fetchEnterpriseReportHistory(profileData.enterprise_id),
    ]);
    setProfile(profileData);
    setWindowState(windowData);
    setHistory(historyData.reports || []);
  };

  useEffect(() => {
    reload().catch((error) => {
      console.error('Failed to load enterprise reports center:', error);
    });
  }, []);

  if (!profile || !windowState) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6">Loading reports center…</div>;
  }

  const canSubmit = windowState.status === 'OPEN';

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setFeedback('');
    try {
      const result = await submitEnterpriseReport({
        enterprise_id: profile.enterprise_id,
        period: windowState.period,
      });
      setFeedback(`${result.message} (${result.report_id})`);
      await reload();
    } catch (error) {
      setFeedback(error?.response?.data?.detail || 'Submit failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-2xl font-bold tracking-tight text-slate-800">Reports Center</h3>
        <p className="text-sm text-slate-500">Prepare and submit monthly report packs to LGU when reporting window is open.</p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-700">Current Submission Window</h4>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Enterprise:</strong> {profile.company_name}</div>
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Period:</strong> {windowState.period}</div>
            <div className="rounded-lg bg-slate-50 p-2.5"><strong>Status:</strong> {windowState.status}</div>
          </div>

          <button
            type="button"
            disabled={!canSubmit || isSubmitting}
            onClick={handleSubmit}
            className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white ${
              canSubmit && !isSubmitting ? 'bg-primary-500 hover:bg-primary-700' : 'cursor-not-allowed bg-slate-400'
            }`}
          >
            Submit Monthly Report to LGU
          </button>

          <p className="mt-2 text-xs text-slate-500">
            Submit button remains disabled until LGU opens reporting window (notification trigger).
          </p>
          {feedback ? <p className="mt-2 text-xs text-primary-700">{feedback}</p> : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-700">Submission History</h4>
          <div className="mt-3 space-y-2">
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">No report submissions yet.</p>
            ) : (
              history.map((item) => (
                <div key={item.report_id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <p className="font-semibold text-slate-800">{item.report_id}</p>
                  <p className="text-xs text-slate-500">{item.period?.month} • {item.submitted_at}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-700">
                    <Clock3 size={12} />
                    <span>Window status at submit: {item.audit?.reporting_window_status_at_submit || 'N/A'}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-emerald-700">
                    <FileCheck2 size={12} />
                    <span>Total Visitors: {item.kpis?.total_visitors_mtd ?? 'N/A'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
