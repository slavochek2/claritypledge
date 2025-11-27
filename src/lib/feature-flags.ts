/**
 * Feature Flags
 *
 * This file contains feature flags for controlling new functionality rollout.
 * Flags can be enabled via environment variables or modified here for development.
 */

export const FEATURES = {
  /**
   * Allow duplicate names during registration
   * When enabled, multiple users can register with the same name.
   * The system will automatically append numbers (e.g., john-doe-1, john-doe-2)
   * to ensure unique profile URLs.
   *
   * Default: false (duplicate names are blocked)
   * Enable: Set VITE_ALLOW_DUPLICATE_NAMES=true in .env.local
   */
  ALLOW_DUPLICATE_NAMES: import.meta.env.VITE_ALLOW_DUPLICATE_NAMES === 'true',
} as const;

/**
 * Type-safe feature flag keys
 */
export type FeatureFlag = keyof typeof FEATURES;

/**
 * Check if a feature is enabled
 * @param flag - The feature flag to check
 * @returns true if the feature is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURES[flag];
}
