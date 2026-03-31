import { useEffect, useMemo, useState } from 'react';
import {
  createEnterpriseAccount,
  deleteEnterpriseAccount,
  fetchLguEnterpriseAccounts,
  updateEnterpriseAccount,
} from '@/features/lgu/master/api/apiService';
import {
  getComplianceStatusTheme,
  isWindowStatusOpen,
  toControlStatusFromWindowStatus,
  toReportingWindowStatus,
} from '@/lib/reportingStatus';
import type {
  LguEnterpriseAccount,
  LguEnterpriseAccountDraft,
  LguMutationResult,
} from '@/types';

const ENTERPRISE_META_STORAGE_KEY = 'lgu-enterprise-management-meta-v1';

interface EnterpriseMeta {
  username: string;
  contactEmail: string;
  barangay: string;
}

interface EnterpriseFormState {
  enterprise_id: string;
  company_name: string;
  linked_lgu_id: string;
  username: string;
  temporary_password: string;
  barangay: string;
  contact_email: string;
}

const createDefaultForm = (): EnterpriseFormState => ({
  enterprise_id: '',
  company_name: '',
  linked_lgu_id: 'lgu_san_pedro_001',
  username: '',
  temporary_password: '',
  barangay: '',
  contact_email: '',
});

const toDraftPayload = (form: EnterpriseFormState): LguEnterpriseAccountDraft => ({
  enterprise_id: form.enterprise_id.trim(),
  company_name: form.company_name.trim(),
  linked_lgu_id: form.linked_lgu_id.trim(),
  username: form.username.trim(),
  temporary_password: form.temporary_password,
  barangay: form.barangay.trim(),
  contact_email: form.contact_email.trim(),
});

const normalize = (value: string): string => value.trim().toLowerCase();

const deriveAccountUsername = (account: LguEnterpriseAccount): string =>
  account.enterprise_id.replace(/^ent_/, '').replace(/_/g, '.');

const readEnterpriseMeta = (): Record<string, EnterpriseMeta> => {
  try {
    const raw = localStorage.getItem(ENTERPRISE_META_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, EnterpriseMeta>;
    return parsed;
  } catch {
    return {};
  }
};

export default function EnterpriseManagementView(): JSX.Element {
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [accounts, setAccounts] = useState<LguEnterpriseAccount[]>([]);
  const [metaByEnterpriseId, setMetaByEnterpriseId] = useState<Record<string, EnterpriseMeta>>(() =>
    readEnterpriseMeta(),
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('');

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEnterpriseId, setEditingEnterpriseId] = useState<string | null>(null);
  const [formState, setFormState] = useState<EnterpriseFormState>(createDefaultForm());

  useEffect(() => {
    const loadAccounts = async (): Promise<void> => {
      const payload = await fetchLguEnterpriseAccounts(period);
      setAccounts(payload.accounts);

      setMetaByEnterpriseId((current) => {
        const next = { ...current };
        payload.accounts.forEach((account) => {
          const existing = next[account.enterprise_id];
          next[account.enterprise_id] = {
            username: existing?.username || account.username || deriveAccountUsername(account),
            contactEmail: existing?.contactEmail || '',
            barangay: existing?.barangay || account.barangay || '',
          };
        });
        return next;
      });

      if (!payload.accounts.length) {
        setFeedback('No enterprise account records returned for the selected period.');
      } else {
        setFeedback('');
      }
    };

    void loadAccounts().catch((error: unknown) => {
      console.error('Failed to load enterprise management accounts:', error);
      setFeedback('Unable to load enterprise account records from backend.');
    });
  }, [period]);

  useEffect(() => {
    localStorage.setItem(ENTERPRISE_META_STORAGE_KEY, JSON.stringify(metaByEnterpriseId));
  }, [metaByEnterpriseId]);

  const filteredAccounts = useMemo<LguEnterpriseAccount[]>(() => {
    const query = normalize(searchQuery);
    if (!query) {
      return accounts;
    }

    return accounts.filter((account) => {
      const meta = metaByEnterpriseId[account.enterprise_id];
      const resolvedUsername = account.username || meta?.username;
      const resolvedBarangay = account.barangay || meta?.barangay;
      const haystack = [
        account.enterprise_id,
        account.company_name,
        account.linked_lgu_id,
        resolvedUsername,
        resolvedBarangay,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [accounts, metaByEnterpriseId, searchQuery]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const pagedAccounts = useMemo<LguEnterpriseAccount[]>(() => {
    const start = (page - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [filteredAccounts, page]);

  const statusMetrics = useMemo(() => {
    const submitted = accounts.filter((item) => item.has_submitted_for_period).length;
    const openWindow = accounts.filter((item) => isWindowStatusOpen(item.reporting_window_status)).length;
    const pending = accounts.length - submitted;
    const warned = accounts.filter((item) => (item.infraction_count || 0) > 0).length;

    return {
      submitted,
      openWindow,
      pending,
      warned,
    };
  }, [accounts]);

  const openCreateModal = (): void => {
    setEditingEnterpriseId(null);
    setFormState(createDefaultForm());
    setFeedback('');
    setIsModalOpen(true);
  };

  const openEditModal = (account: LguEnterpriseAccount): void => {
    const meta = metaByEnterpriseId[account.enterprise_id];
    setEditingEnterpriseId(account.enterprise_id);
    setFormState({
      enterprise_id: account.enterprise_id,
      company_name: account.company_name,
      linked_lgu_id: account.linked_lgu_id,
      username: account.username || meta?.username || account.company_name.toLowerCase().replace(/\s+/g, '.'),
      temporary_password: '',
      barangay: account.barangay || meta?.barangay || '',
      contact_email: meta?.contactEmail || '',
    });
    setFeedback('');
    setIsModalOpen(true);
  };

  const closeModal = (): void => {
    setIsModalOpen(false);
    setEditingEnterpriseId(null);
    setFormState(createDefaultForm());
  };

  const handleChange = (
    key: keyof EnterpriseFormState,
    value: string,
  ): void => {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const applyMutationFeedback = (mutationResult: LguMutationResult): void => {
    setFeedback(mutationResult.message);
  };

  const handleSave = async (): Promise<void> => {
    const draft = toDraftPayload(formState);

    if (!draft.enterprise_id || !draft.company_name || !draft.username || !draft.contact_email) {
      setFeedback('Enterprise ID, company name, username, and contact email are required.');
      return;
    }

    setIsSaving(true);
    setFeedback('');

    try {
      const mutationResult = editingEnterpriseId
        ? await updateEnterpriseAccount(editingEnterpriseId, draft)
        : await createEnterpriseAccount(draft);

      applyMutationFeedback(mutationResult);

      setMetaByEnterpriseId((current) => ({
        ...current,
        [draft.enterprise_id]: {
          username: draft.username,
          contactEmail: draft.contact_email,
          barangay: draft.barangay,
        },
      }));

      if (editingEnterpriseId) {
        setAccounts((current) =>
          current.map((item) =>
            item.enterprise_id === editingEnterpriseId
              ? {
                ...item,
                enterprise_id: draft.enterprise_id,
                company_name: draft.company_name,
                linked_lgu_id: draft.linked_lgu_id,
                username: draft.username,
                barangay: draft.barangay,
              }
              : item,
          ),
        );
      } else {
        setAccounts((current) => [
          {
            enterprise_id: draft.enterprise_id,
            company_name: draft.company_name,
            linked_lgu_id: draft.linked_lgu_id,
            username: draft.username,
            barangay: draft.barangay,
            reporting_window_status: 'CLOSED',
            has_submitted_for_period: false,
            period,
          },
          ...current,
        ]);
      }

      closeModal();
    } catch (error: unknown) {
      console.error('Enterprise account save failed:', error);
      setFeedback('Unable to save enterprise account right now.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (enterpriseId: string): Promise<void> => {
    const shouldDelete = globalThis.confirm(
      `Delete enterprise account ${enterpriseId}? This action updates master account control records.`,
    );

    if (!shouldDelete) {
      return;
    }

    setIsSaving(true);
    setFeedback('');
    try {
      const mutationResult = await deleteEnterpriseAccount(enterpriseId);
      applyMutationFeedback(mutationResult);
      setAccounts((current) => current.filter((item) => item.enterprise_id !== enterpriseId));
      setMetaByEnterpriseId((current) => {
        const clone = { ...current };
        delete clone[enterpriseId];
        return clone;
      });
    } catch (error: unknown) {
      console.error('Enterprise account delete failed:', error);
      setFeedback('Unable to delete enterprise account at this time.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid min-h-full gap-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Registered Enterprises</p>
          <p className="mt-2 text-3xl font-black text-brand-dark">{accounts.length}</p>
        </article>
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Submitted</p>
          <p className="mt-2 text-3xl font-black text-emerald-700">{statusMetrics.submitted}</p>
        </article>
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pending</p>
          <p className="mt-2 text-3xl font-black text-amber-700">{statusMetrics.pending}</p>
        </article>
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Window OPEN</p>
          <p className="mt-2 text-3xl font-black text-blue-700">{statusMetrics.openWindow}</p>
        </article>
        <article className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Warned Enterprises</p>
          <p className="mt-2 text-3xl font-black text-rose-700">{statusMetrics.warned}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-brand-light/70 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-brand-dark">Master Account Control</h3>
            <p className="text-sm text-slate-600">
              Create and maintain the credentials used by enterprise portals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={period}
              onChange={(event) => setPeriod(event.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
            />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search enterprise / username / barangay"
              className="w-72 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
            />
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-xl bg-brand-dark px-3 py-2 text-sm font-semibold text-brand-cream hover:bg-brand-mid"
            >
              Add Enterprise Account
            </button>
          </div>
        </div>

        {feedback ? <p className="mt-3 text-xs font-medium text-brand-dark">{feedback}</p> : null}

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-brand-cream text-slate-600">
              <tr>
                <th className="px-3 py-2">Enterprise ID</th>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Barangay</th>
                <th className="px-3 py-2">Compliance</th>
                <th className="px-3 py-2">Window</th>
                <th className="px-3 py-2">Submission</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedAccounts.map((account) => {
                const meta = metaByEnterpriseId[account.enterprise_id];
                const resolvedUsername = account.username || meta?.username || deriveAccountUsername(account);
                const resolvedBarangay = account.barangay || meta?.barangay || '-';
                const windowStatus = String(account.reporting_window_status || 'CLOSED').toUpperCase();
                const controlStatus = toControlStatusFromWindowStatus(windowStatus);
                const statusTheme = getComplianceStatusTheme(controlStatus);
                return (
                  <tr key={account.enterprise_id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs text-brand-dark">{account.enterprise_id}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{account.company_name}</td>
                    <td className="px-3 py-2">{resolvedUsername}</td>
                    <td className="px-3 py-2">{resolvedBarangay}</td>
                    <td className="px-3 py-2">
                      {(account.infraction_count || 0) > 0 ? (
                        <div>
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                            Warning • {account.infraction_count}
                          </span>
                          {account.latest_infraction ? (
                            <p className="mt-1 text-[10px] text-rose-700">{account.latest_infraction.type}</p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          Clear
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          windowStatus === 'SUBMITTED'
                            ? 'bg-blue-100 text-blue-700'
                            : statusTheme.chipClass
                        }`}
                      >
                        {windowStatus === 'SUBMITTED'
                          ? 'SUBMITTED'
                          : toReportingWindowStatus(controlStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          account.has_submitted_for_period
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {account.has_submitted_for_period ? 'Submitted' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(account)}
                          className="rounded-md border border-brand-light px-2 py-1 text-xs font-semibold text-brand-dark hover:bg-brand-cream"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDelete(account.enterprise_id);
                          }}
                          disabled={isSaving}
                          className="rounded-md border border-rose-300 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!pagedAccounts.length ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                    No enterprise records found for your current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
          <p>
            Showing {(page - 1) * pageSize + (pagedAccounts.length ? 1 : 0)}-
            {(page - 1) * pageSize + pagedAccounts.length} of {filteredAccounts.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50"
            >
              Prev
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
              className="rounded-md border border-slate-300 px-2 py-1 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-brand-light/70 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="text-lg font-bold text-brand-dark">
              {editingEnterpriseId ? 'Edit Enterprise Account' : 'Create Enterprise Account'}
            </h4>
            <p className="mt-1 text-sm text-slate-600">
              This profile controls enterprise portal login credentials and node identity.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Enterprise ID
                <input
                  value={formState.enterprise_id}
                  onChange={(event) => handleChange('enterprise_id', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
                  disabled={Boolean(editingEnterpriseId)}
                />
              </label>

              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Company Name
                <input
                  value={formState.company_name}
                  onChange={(event) => handleChange('company_name', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
                />
              </label>

              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Username
                <input
                  value={formState.username}
                  onChange={(event) => handleChange('username', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
                />
              </label>

              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Temporary Password
                <input
                  type="password"
                  value={formState.temporary_password}
                  onChange={(event) => handleChange('temporary_password', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
                  placeholder={editingEnterpriseId ? 'Leave blank to keep current' : ''}
                />
              </label>

              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Barangay
                <input
                  value={formState.barangay}
                  onChange={(event) => handleChange('barangay', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
                />
              </label>

              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Contact Email
                <input
                  type="email"
                  value={formState.contact_email}
                  onChange={(event) => handleChange('contact_email', event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-mid focus:outline-none"
                />
              </label>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleSave();
                }}
                disabled={isSaving}
                className="rounded-lg bg-brand-dark px-3 py-2 text-sm font-semibold text-brand-cream hover:bg-brand-mid disabled:opacity-60"
              >
                {isSaving ? 'Saving...' : editingEnterpriseId ? 'Update Account' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
