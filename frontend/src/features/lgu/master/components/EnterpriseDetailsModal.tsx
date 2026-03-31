import { useEffect } from 'react';
import type { LguEnterpriseAnalyticsDetail, LguEnterpriseNode } from '@/types';

interface EnterpriseDetailsModalProps {
  enterprise: LguEnterpriseNode | null;
  analytics: LguEnterpriseAnalyticsDetail | null;
  onClose: () => void;
}

function toComplianceStatus(status: string): 'Active' | 'Needs Renewal' {
  return status.toLowerCase() === 'active' ? 'Active' : 'Needs Renewal';
}

export default function EnterpriseDetailsModal({
  enterprise,
  analytics,
  onClose,
}: EnterpriseDetailsModalProps): JSX.Element | null {
  useEffect(() => {
    if (!enterprise) {
      return;
    }

    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enterprise, onClose]);

  if (!enterprise) {
    return null;
  }

  const complianceStatus = toComplianceStatus(enterprise.status);

  return (
    <div
      className="fixed inset-0 z-1000 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="enterprise-details-modal-title"
        className="relative z-1001 w-full max-w-3xl overflow-hidden rounded-2xl border border-brand-mid bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 bg-brand-dark px-5 py-4 text-brand-cream">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-cream/85">
              Enterprise Details
            </p>
            <h3 id="enterprise-details-modal-title" className="mt-1 text-2xl font-bold leading-tight">
              {enterprise.name}
            </h3>
            <p className="mt-1 text-sm text-brand-cream/90">
              {enterprise.type} • {enterprise.barangay}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-brand-cream/40 bg-brand-mid/35 px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand-mid/55"
          >
            Close
          </button>
        </header>

        <div className="grid gap-3 bg-brand-cream p-4 sm:grid-cols-2">
          <article className="rounded-xl border border-brand-mid/55 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Visitors</p>
            <p className="mt-1 text-xl font-bold text-brand-dark">
              {analytics ? analytics.monthlyVisitors.toLocaleString() : 'Loading...'}
            </p>
          </article>

          <article className="rounded-xl border border-brand-mid/55 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Top Segment</p>
            <p className="mt-1 text-xl font-bold text-brand-dark">
              {analytics?.topDemographic ?? 'Loading...'}
            </p>
          </article>

          <article className="rounded-xl border border-brand-mid/55 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Local vs Non-Local</p>
            <p className="mt-1 text-lg font-bold text-brand-dark">
              {analytics
                ? `${analytics.localResidents.toLocaleString()} / ${analytics.nonLocalResidents.toLocaleString()}`
                : 'Loading...'}
            </p>
          </article>

          <article className="rounded-xl border border-brand-mid/55 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Male / Female Ratio</p>
            <p className="mt-1 text-lg font-bold text-brand-dark">
              {analytics
                ? `${analytics.maleRatioPct}% / ${analytics.femaleRatioPct}%`
                : 'Loading...'}
            </p>
          </article>

          <article className="rounded-xl border border-brand-mid/55 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Tourists</p>
            <p className="mt-1 text-xl font-bold text-brand-dark">
              {analytics ? analytics.totalTourists.toLocaleString() : 'Loading...'}
            </p>
          </article>

          <article className="rounded-xl border border-brand-mid/55 bg-white p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
            <p
              className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                complianceStatus === 'Active'
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {complianceStatus}
            </p>
          </article>
        </div>

        <div className="border-t border-brand-mid/45 bg-white px-4 py-3">
          {analytics ? (
            <div className="rounded-xl border border-brand-mid/40 bg-brand-cream/65 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">Visitor Demographics</p>
              <ul className="mt-2 grid gap-1 text-sm text-slate-700 sm:grid-cols-2">
                {analytics.demographics.map((entry) => (
                  <li
                    key={`${enterprise.id}-${entry.name}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1"
                  >
                    <span>{entry.name}</span>
                    <span className="font-semibold text-brand-dark">{entry.value.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Loading enterprise statistics...</p>
          )}
        </div>
      </div>
    </div>
  );
}
