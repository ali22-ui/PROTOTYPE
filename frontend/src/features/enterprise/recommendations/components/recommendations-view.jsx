import { useEffect, useMemo, useState } from 'react';
import { Lightbulb, UsersRound, TriangleAlert } from 'lucide-react';
import { fetchEnterpriseRecommendations } from '../api/get-recommendations';

export default function RecommendationsView() {
  const [recommendations, setRecommendations] = useState([]);
  const [hourlyVisitors, setHourlyVisitors] = useState(120);
  const [currentStaff, setCurrentStaff] = useState(6);

  useEffect(() => {
    fetchEnterpriseRecommendations()
      .then((data) => {
        setRecommendations(data.recommendations || []);
      })
      .catch((error) => {
        console.error('Failed to load recommendations:', error);
      });
  }, []);

  const targetStaff = useMemo(() => {
    const computed = Math.ceil(hourlyVisitors / 22);
    return Math.max(2, computed);
  }, [hourlyVisitors]);

  const delta = targetStaff - currentStaff;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-2xl font-bold tracking-tight text-slate-800">
          AI Recommendations
        </h3>
        <p className="text-sm text-slate-500">
          Recommended enterprise extension: Staffing optimization +
          dwell/traffic anomaly assistant.
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-700">
            Staff-to-Visitor Optimization Simulator
          </h4>

          <div className="mt-3 space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-slate-600">
                Projected hourly visitors: <strong>{hourlyVisitors}</strong>
              </span>
              <input
                type="range"
                min="30"
                max="320"
                value={hourlyVisitors}
                onChange={(e) => setHourlyVisitors(Number(e.target.value))}
                className="w-full"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-slate-600">
                Current staff on floor: <strong>{currentStaff}</strong>
              </span>
              <input
                type="range"
                min="2"
                max="20"
                value={currentStaff}
                onChange={(e) => setCurrentStaff(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="flex items-center gap-1 font-semibold text-slate-800">
              <UsersRound size={14} /> Recommended Staff: {targetStaff}
            </p>
            <p
              className={`mt-1 ${delta > 0 ? 'text-amber-700' : delta < 0 ? 'text-blue-700' : 'text-emerald-700'}`}
            >
              {delta > 0
                ? `Add ${delta} staff to maintain service quality.`
                : delta < 0
                  ? `You can reduce by ${Math.abs(delta)} staff without exceeding threshold.`
                  : 'Current staffing is optimal.'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-700">
            Recommended AI Feature Cards
          </h4>
          <div className="mt-3 space-y-2">
            {recommendations.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"
              >
                <p className="flex items-center gap-1 font-semibold text-slate-800">
                  <Lightbulb size={14} /> {item.feature}
                </p>
                <p className="mt-1 text-slate-600">{item.recommendation}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Confidence: {(item.confidence * 100).toFixed(0)}%
                </p>
              </div>
            ))}

            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="flex items-center gap-1 font-semibold">
                <TriangleAlert size={14} /> Dwell-Time Alert Rule
              </p>
              <p className="mt-1">
                Trigger real-time alert when average dwell exceeds 95 minutes
                across two consecutive windows.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
