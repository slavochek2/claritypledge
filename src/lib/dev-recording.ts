/**
 * P809: Dev-recording URL flag.
 *
 * On non-prod environments, the `/live` recording pipeline is gated off by default
 * (`clarity-live-page.tsx:859`) to keep dev sessions out of training data. When the
 * URL contains `?dev-recording=1`, this flag flips the gate open and chunk filenames
 * are prefixed with `_dev_` so training pipelines can trivially filter them out.
 *
 * The flag is a no-op on prod — the env check is the outer guard.
 */

export const DEV_RECORDING_FILENAME_PREFIX = '_dev_';

/**
 * Returns true iff:
 *   (a) build is NOT prod, AND
 *   (b) current URL carries `?dev-recording=1`.
 *
 * Prod is the outer guard: even if someone puts `?dev-recording=1` in a prod URL,
 * this function returns false. That invariant is load-bearing — it is what keeps
 * this feature out of the prod code path.
 */
export function isDevRecordingActive(): boolean {
  if (import.meta.env.PROD) return false;
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('dev-recording') === '1';
}

/**
 * Returns the filename prefix to apply to ml-training uploads in the current
 * environment: `_dev_` when dev-recording is active, empty string otherwise.
 */
export function devRecordingFilenamePrefix(): string {
  return isDevRecordingActive() ? DEV_RECORDING_FILENAME_PREFIX : '';
}
