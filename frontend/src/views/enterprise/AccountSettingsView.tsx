import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import type { EnterpriseOutletContext } from '@/components/layout/EnterpriseShell';
import {
  fetchEnterpriseAccountSettings,
  saveEnterpriseAccountProfile,
  saveEnterpriseSystemPreferences,
  updateEnterpriseAccountPassword,
} from '@/services/api';
import type {
  EnterpriseAccountProfileSettings,
  EnterprisePasswordUpdatePayload,
  EnterpriseSystemPreferences,
} from '@/types';

type SettingsTab = 'profile' | 'security' | 'preferences';

type ToastState = {
  type: 'success' | 'error';
  message: string;
};

const PROFILE_TAB_LABEL = 'Profile / Enterprise Info';
const SECURITY_TAB_LABEL = 'Security';
const PREFERENCES_TAB_LABEL = 'System Preferences';

const isValidEmail = (value: string): boolean => /.+@.+\..+/.test(value.trim());

const isValidPhone = (value: string): boolean => value.trim().replace(/[^\d]/g, '').length >= 10;

export default function AccountSettingsView(): JSX.Element {
  const { user } = useOutletContext<EnterpriseOutletContext>();
  const toastTimerRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [loading, setLoading] = useState(true);

  const [profile, setProfile] = useState<EnterpriseAccountProfileSettings>({
    businessPermit: user.businessPermit,
    contactEmail: '',
    businessPhone: '',
    representativeName: '',
  });

  const [preferences, setPreferences] = useState<EnterpriseSystemPreferences>({
    emailNotifications: true,
    themePreference: 'system',
  });

  const [passwordPayload, setPasswordPayload] = useState<EnterprisePasswordUpdatePayload>({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const pushToast = useCallback((type: ToastState['type'], message: string): void => {
    setToast({ type, message });

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, 2800);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadAccountSettings = async (): Promise<void> => {
      setLoading(true);
      try {
        const settings = await fetchEnterpriseAccountSettings(user.enterpriseId, user.businessPermit);
        if (!mounted) {
          return;
        }

        setProfile(settings.profile);
        setPreferences(settings.preferences);
      } catch (err) {
        if (!mounted) {
          return;
        }

        const message = err instanceof Error ? err.message : 'Unable to load account settings.';
        pushToast('error', message);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void loadAccountSettings();

    return () => {
      mounted = false;
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [pushToast, user.businessPermit, user.enterpriseId]);

  const handleSaveProfile = async (): Promise<void> => {
    if (!isValidEmail(profile.contactEmail)) {
      pushToast('error', 'Please provide a valid contact email.');
      return;
    }

    if (!isValidPhone(profile.businessPhone)) {
      pushToast('error', 'Please provide a valid business phone number.');
      return;
    }

    if (!profile.representativeName.trim()) {
      pushToast('error', 'Representative name is required.');
      return;
    }

    setSavingProfile(true);

    try {
      const result = await saveEnterpriseAccountProfile(user.enterpriseId, profile);
      pushToast(result.success ? 'success' : 'error', result.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile settings.';
      pushToast('error', message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (): Promise<void> => {
    if (!passwordPayload.currentPassword.trim()) {
      pushToast('error', 'Current password is required.');
      return;
    }

    if (passwordPayload.newPassword.length < 8) {
      pushToast('error', 'New password must be at least 8 characters long.');
      return;
    }

    if (passwordPayload.newPassword !== passwordPayload.confirmNewPassword) {
      pushToast('error', 'Password confirmation does not match.');
      return;
    }

    setSavingPassword(true);

    try {
      const result = await updateEnterpriseAccountPassword(user.enterpriseId, passwordPayload);
      pushToast(result.success ? 'success' : 'error', result.message);

      if (result.success) {
        setPasswordPayload({
          currentPassword: '',
          newPassword: '',
          confirmNewPassword: '',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update password.';
      pushToast('error', message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSavePreferences = async (): Promise<void> => {
    setSavingPreferences(true);

    try {
      const result = await saveEnterpriseSystemPreferences(
        user.enterpriseId,
        user.businessPermit,
        preferences,
      );
      pushToast(result.success ? 'success' : 'error', result.message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save system preferences.';
      pushToast('error', message);
    } finally {
      setSavingPreferences(false);
    }
  };

  return (
    <div className="grid min-h-[calc(100vh-7rem)] gap-4 lg:grid-cols-[280px_1fr]">
      {toast ? (
        <div
          className={[
            'fixed right-6 top-6 z-50 rounded-lg border px-4 py-2 text-sm shadow-lg',
            toast.type === 'success'
              ? 'border-brand-mid bg-brand-cream text-brand-dark'
              : 'border-rose-300 bg-rose-50 text-rose-700',
          ].join(' ')}
        >
          {toast.message}
        </div>
      ) : null}

      <aside className="rounded-2xl border border-brand-light bg-brand-cream p-4 shadow-sm">
        <h2 className="text-lg font-bold text-brand-dark">Account Settings</h2>
        <p className="mt-1 text-xs text-brand-dark/80">
          Manage profile details, security, and system preferences.
        </p>

        <nav className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={[
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition',
              activeTab === 'profile'
                ? 'bg-brand-dark text-brand-cream'
                : 'text-brand-dark hover:bg-brand-light/45',
            ].join(' ')}
          >
            <UserRound size={16} />
            {PROFILE_TAB_LABEL}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('security')}
            className={[
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition',
              activeTab === 'security'
                ? 'bg-brand-dark text-brand-cream'
                : 'text-brand-dark hover:bg-brand-light/45',
            ].join(' ')}
          >
            <ShieldCheck size={16} />
            {SECURITY_TAB_LABEL}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('preferences')}
            className={[
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition',
              activeTab === 'preferences'
                ? 'bg-brand-dark text-brand-cream'
                : 'text-brand-dark hover:bg-brand-light/45',
            ].join(' ')}
          >
            <SlidersHorizontal size={16} />
            {PREFERENCES_TAB_LABEL}
          </button>
        </nav>
      </aside>

      <section className="rounded-2xl border border-brand-light bg-white p-5 shadow-sm">
        {loading ? (
          <div className="grid min-h-[320px] place-items-center text-sm text-brand-dark/80">
            Loading account settings...
          </div>
        ) : null}

        {!loading && activeTab === 'profile' ? (
          <div className="space-y-4">
            <header>
              <h3 className="text-xl font-bold text-brand-dark">{PROFILE_TAB_LABEL}</h3>
              <p className="text-sm text-brand-dark/80">
                Update your enterprise contact metadata used in LGU report workflows.
              </p>
            </header>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-brand-dark">
                Business Permit Username
                <input
                  type="text"
                  value={profile.businessPermit}
                  disabled
                  className="mt-1 w-full rounded-lg border border-brand-light bg-brand-cream px-3 py-2 text-sm text-brand-dark/80"
                />
              </label>

              <label className="text-sm text-brand-dark">
                Contact Email
                <input
                  type="email"
                  value={profile.contactEmail}
                  onChange={(event) => setProfile((prev) => ({ ...prev, contactEmail: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-brand-light px-3 py-2 text-sm outline-none focus:border-brand-mid"
                />
              </label>

              <label className="text-sm text-brand-dark">
                Business Phone
                <input
                  type="tel"
                  value={profile.businessPhone}
                  onChange={(event) => setProfile((prev) => ({ ...prev, businessPhone: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-brand-light px-3 py-2 text-sm outline-none focus:border-brand-mid"
                />
              </label>

              <label className="text-sm text-brand-dark">
                Representative Name
                <input
                  type="text"
                  value={profile.representativeName}
                  onChange={(event) => setProfile((prev) => ({ ...prev, representativeName: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-brand-light px-3 py-2 text-sm outline-none focus:border-brand-mid"
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  void handleSaveProfile();
                }}
                disabled={savingProfile}
                className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-brand-cream hover:bg-brand-mid hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingProfile ? 'Saving...' : 'Save Profile Settings'}
              </button>
            </div>
          </div>
        ) : null}

        {!loading && activeTab === 'security' ? (
          <div className="space-y-4">
            <header>
              <h3 className="text-xl font-bold text-brand-dark">{SECURITY_TAB_LABEL}</h3>
              <p className="text-sm text-brand-dark/80">
                Update your password with frontend validation for minimum length and confirmation.
              </p>
            </header>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-brand-dark md:col-span-2">
                Current Password
                <input
                  type="password"
                  value={passwordPayload.currentPassword}
                  onChange={(event) =>
                    setPasswordPayload((prev) => ({ ...prev, currentPassword: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-brand-light px-3 py-2 text-sm outline-none focus:border-brand-mid"
                />
              </label>

              <label className="text-sm text-brand-dark">
                New Password
                <input
                  type="password"
                  value={passwordPayload.newPassword}
                  onChange={(event) =>
                    setPasswordPayload((prev) => ({ ...prev, newPassword: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-brand-light px-3 py-2 text-sm outline-none focus:border-brand-mid"
                />
              </label>

              <label className="text-sm text-brand-dark">
                Confirm New Password
                <input
                  type="password"
                  value={passwordPayload.confirmNewPassword}
                  onChange={(event) =>
                    setPasswordPayload((prev) => ({ ...prev, confirmNewPassword: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-brand-light px-3 py-2 text-sm outline-none focus:border-brand-mid"
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  void handleSavePassword();
                }}
                disabled={savingPassword}
                className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-brand-cream hover:bg-brand-mid hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingPassword ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        ) : null}

        {!loading && activeTab === 'preferences' ? (
          <div className="space-y-4">
            <header>
              <h3 className="text-xl font-bold text-brand-dark">{PREFERENCES_TAB_LABEL}</h3>
              <p className="text-sm text-brand-dark/80">
                Configure notification and interface preferences for your enterprise workspace.
              </p>
            </header>

            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-lg border border-brand-light bg-brand-cream px-4 py-3 text-sm text-brand-dark">
                <span className="font-medium">Email Notifications</span>
                <input
                  type="checkbox"
                  checked={preferences.emailNotifications}
                  onChange={(event) =>
                    setPreferences((prev) => ({ ...prev, emailNotifications: event.target.checked }))}
                  className="h-4 w-4 rounded border-brand-mid text-brand-dark focus:ring-brand-mid"
                />
              </label>

              <label className="block text-sm text-brand-dark">
                Theme Preference
                <select
                  value={preferences.themePreference}
                  onChange={(event) =>
                    setPreferences((prev) => ({
                      ...prev,
                      themePreference: event.target.value as EnterpriseSystemPreferences['themePreference'],
                    }))}
                  className="mt-1 w-full rounded-lg border border-brand-light px-3 py-2 text-sm outline-none focus:border-brand-mid"
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  void handleSavePreferences();
                }}
                disabled={savingPreferences}
                className="rounded-lg bg-brand-dark px-4 py-2 text-sm font-semibold text-brand-cream hover:bg-brand-mid hover:text-brand-dark disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingPreferences ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
