import { useMemo, useState } from 'react';
import { loadLguSettings, saveLguSettings } from '@/features/lgu/master/api/apiService';
import type { LguSettingsPayload } from '@/types';

export default function SettingsView(): JSX.Element {
  const [settings, setSettings] = useState<LguSettingsPayload>(() => loadLguSettings());
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string>('');

  const canSave = useMemo<boolean>(() => {
    return Boolean(settings.adminUsername.trim() && settings.adminEmail.trim());
  }, [settings.adminEmail, settings.adminUsername]);

  const setField = (key: keyof LguSettingsPayload, value: string): void => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const setPreference = (
    key: keyof LguSettingsPayload['preferences'],
    value: boolean,
  ): void => {
    setSettings((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        [key]: value,
      },
    }));
  };

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    setFeedback('');

    try {
      const response = await saveLguSettings(settings);
      setFeedback(response.message);
      if (response.success) {
        setSettings((current) => ({
          ...current,
          currentPassword: '',
          newPassword: '',
          confirmNewPassword: '',
        }));
      }
    } catch (error: unknown) {
      console.error('Failed to save LGU settings:', error);
      setFeedback('Unable to save LGU settings right now.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid min-h-full gap-4 lg:grid-cols-[1.1fr_1fr]">
      <section className="rounded-2xl border border-brand-light/70 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-brand-dark">LGU Admin Credentials</h3>
        <p className="text-sm text-slate-600">
          Manage LGU master account details and password controls.
        </p>

        <div className="mt-4 grid gap-3">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Admin Username
            <input
              value={settings.adminUsername}
              onChange={(event) => setField('adminUsername', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-mid focus:outline-none"
            />
          </label>

          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Admin Email
            <input
              type="email"
              value={settings.adminEmail}
              onChange={(event) => setField('adminEmail', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-mid focus:outline-none"
            />
          </label>

          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Current Password
            <input
              type="password"
              value={settings.currentPassword}
              onChange={(event) => setField('currentPassword', event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-mid focus:outline-none"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              New Password
              <input
                type="password"
                value={settings.newPassword}
                onChange={(event) => setField('newPassword', event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-mid focus:outline-none"
              />
            </label>

            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Confirm New Password
              <input
                type="password"
                value={settings.confirmNewPassword}
                onChange={(event) => setField('confirmNewPassword', event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-brand-mid focus:outline-none"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-brand-light/70 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-brand-dark">System Preferences</h3>
        <p className="text-sm text-slate-600">
          Configure portal behavior for alerts, digest reports, and visual preferences.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between rounded-xl border border-brand-light/70 bg-brand-cream px-3 py-2 text-sm">
            <span>Enable system alerts</span>
            <input
              type="checkbox"
              checked={settings.preferences.systemAlerts}
              onChange={(event) => setPreference('systemAlerts', event.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-brand-light/70 bg-brand-cream px-3 py-2 text-sm">
            <span>Compliance digest emails</span>
            <input
              type="checkbox"
              checked={settings.preferences.complianceDigest}
              onChange={(event) => setPreference('complianceDigest', event.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-brand-light/70 bg-brand-cream px-3 py-2 text-sm">
            <span>Dark mode (beta)</span>
            <input
              type="checkbox"
              checked={settings.preferences.darkMode}
              onChange={(event) => setPreference('darkMode', event.target.checked)}
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={!canSave || isSaving}
          className="mt-6 rounded-xl bg-brand-dark px-4 py-2.5 text-sm font-semibold text-brand-cream hover:bg-brand-mid disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving settings...' : 'Save Settings'}
        </button>

        {feedback ? (
          <p className="mt-3 rounded-lg bg-brand-cream px-3 py-2 text-xs font-medium text-brand-dark">
            {feedback}
          </p>
        ) : null}
      </section>
    </div>
  );
}
