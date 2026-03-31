/**
 * Feature flags for staged fallback decommissioning.
 * PRD_011: Unified Supabase Data Architecture Migration
 *
 * These flags control the gradual removal of frontend fallback behavior
 * as backend endpoints become the single source of truth.
 */

export interface FeatureFlags {
  // Data source flags
  useBackendForReportingWindows: boolean;
  useBackendForReportSubmissions: boolean;
  useBackendForInfractions: boolean;
  useBackendForComplianceActions: boolean;
  useBackendForEnterpriseSettings: boolean;
  useBackendForLguSettings: boolean;

  // Fallback behavior flags
  enableLocalStorageFallback: boolean;
  enableDeterministicFallbackPayloads: boolean;
  enablePortalBridgeSync: boolean;

  // UI behavior flags
  showBackendConnectionStatus: boolean;
  showDataSourceIndicator: boolean;
}

const defaultFlags: FeatureFlags = {
  // Phase 1: Start using backend for new features
  useBackendForReportingWindows: true,
  useBackendForReportSubmissions: true,
  useBackendForInfractions: true,
  useBackendForComplianceActions: true,
  useBackendForEnterpriseSettings: true,
  useBackendForLguSettings: true,

  // Phase 2: Gradually disable fallbacks (set to false when ready)
  enableLocalStorageFallback: true, // Set to false after backend parity verified
  enableDeterministicFallbackPayloads: true, // Set to false after backend parity verified
  enablePortalBridgeSync: true, // Set to false after backend parity verified

  // Debug/development flags
  showBackendConnectionStatus: false,
  showDataSourceIndicator: false,
};

// Environment-based overrides
const getEnvFlags = (): Partial<FeatureFlags> => {
  const envFlags: Partial<FeatureFlags> = {};

  // Check for environment variable overrides
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const env = import.meta.env;

    if (env.VITE_DISABLE_FALLBACKS === 'true') {
      envFlags.enableLocalStorageFallback = false;
      envFlags.enableDeterministicFallbackPayloads = false;
      envFlags.enablePortalBridgeSync = false;
    }

    if (env.VITE_SHOW_DATA_SOURCE === 'true') {
      envFlags.showDataSourceIndicator = true;
      envFlags.showBackendConnectionStatus = true;
    }

    if (env.VITE_USE_BACKEND_ONLY === 'true') {
      envFlags.useBackendForReportingWindows = true;
      envFlags.useBackendForReportSubmissions = true;
      envFlags.useBackendForInfractions = true;
      envFlags.useBackendForComplianceActions = true;
      envFlags.useBackendForEnterpriseSettings = true;
      envFlags.useBackendForLguSettings = true;
      envFlags.enableLocalStorageFallback = false;
      envFlags.enableDeterministicFallbackPayloads = false;
      envFlags.enablePortalBridgeSync = false;
    }
  }

  return envFlags;
};

// LocalStorage key for runtime flag overrides
const FEATURE_FLAGS_STORAGE_KEY = 'feature-flags-v1';

const getStoredFlags = (): Partial<FeatureFlags> => {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {};
  }

  try {
    const stored = window.localStorage.getItem(FEATURE_FLAGS_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as Partial<FeatureFlags>;
    }
  } catch {
    // Ignore parse errors
  }

  return {};
};

// Merge flags: defaults < env < localStorage
const mergeFlags = (): FeatureFlags => {
  return {
    ...defaultFlags,
    ...getEnvFlags(),
    ...getStoredFlags(),
  };
};

// Current active flags
let currentFlags: FeatureFlags = mergeFlags();

/**
 * Get the current feature flags.
 */
export const getFeatureFlags = (): FeatureFlags => {
  return { ...currentFlags };
};

/**
 * Get a specific feature flag value.
 */
export const getFlag = <K extends keyof FeatureFlags>(key: K): FeatureFlags[K] => {
  return currentFlags[key];
};

/**
 * Set a feature flag value (persisted to localStorage).
 */
export const setFlag = <K extends keyof FeatureFlags>(key: K, value: FeatureFlags[K]): void => {
  currentFlags[key] = value;

  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    const stored = getStoredFlags();
    stored[key] = value;
    window.localStorage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(stored));
  }
};

/**
 * Reset all flags to defaults.
 */
export const resetFlags = (): void => {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.removeItem(FEATURE_FLAGS_STORAGE_KEY);
  }
  currentFlags = mergeFlags();
};

/**
 * Check if backend should be used for a specific data domain.
 */
export const shouldUseBackend = (domain: 'reportingWindows' | 'reportSubmissions' | 'infractions' | 'complianceActions' | 'enterpriseSettings' | 'lguSettings'): boolean => {
  const domainFlagMap: Record<string, keyof FeatureFlags> = {
    reportingWindows: 'useBackendForReportingWindows',
    reportSubmissions: 'useBackendForReportSubmissions',
    infractions: 'useBackendForInfractions',
    complianceActions: 'useBackendForComplianceActions',
    enterpriseSettings: 'useBackendForEnterpriseSettings',
    lguSettings: 'useBackendForLguSettings',
  };

  return currentFlags[domainFlagMap[domain]];
};

/**
 * Check if fallback behavior is enabled.
 */
export const isFallbackEnabled = (): boolean => {
  return currentFlags.enableLocalStorageFallback || currentFlags.enableDeterministicFallbackPayloads;
};

/**
 * Check if portal bridge sync is enabled.
 */
export const isPortalBridgeEnabled = (): boolean => {
  return currentFlags.enablePortalBridgeSync;
};

// Export type for external use
export type { FeatureFlags };
