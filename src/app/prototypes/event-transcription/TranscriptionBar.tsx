/**
 * @file TranscriptionBar.tsx
 * @description P1307 clickable prototype — cross-page "transcription is running" bar shown
 * on the mock /meet screen while transcription is active.
 *
 * MIRRORS (does not reuse) `src/app/components/session/active-session-banner.tsx`:
 * `ActiveSessionBanner` reads `useLiveSession()` (real session context, real Supabase-backed
 * terminate/rejoin calls) — wiring a prototype through that context would either fake a real
 * context provider or risk a real network call, so this is a presentational sibling instead.
 * Classes copied 1:1 from that file so the two bars are visually identical:
 *   - outer: `relative z-40 bg-blue-50 border-b border-blue-200 px-4 py-2`, `role="status"`, `aria-live="polite"`
 *   - inner: `max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4`
 *   - pulse dot: `inline-block h-2 w-2 rounded-full bg-blue-500 motion-safe:animate-pulse motion-reduce:animate-none`
 *   - primary action button: `bg-blue-500 text-white text-sm font-medium rounded-md h-8 px-4 hover:bg-blue-600`
 *   - secondary/destructive action: `text-sm text-destructive hover:underline h-8 px-3`
 *
 * See the prototype's report for whether a shared presentational bar should be extracted so
 * the real `/live` banner and this transcription bar render from one component.
 */
export function TranscriptionBar({
  onOpen,
  onEnd,
}: {
  onOpen: () => void;
  onEnd: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Room transcription active"
      data-testid="transcription-bar"
      className="relative z-40 bg-blue-50 border-b border-blue-200 px-4 py-2"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-blue-500 motion-safe:animate-pulse motion-reduce:animate-none"
          />
          <span className="text-sm font-medium text-blue-900">
            Transcribing for AI insights
          </span>
        </div>

        <div className="flex items-center gap-4 sm:flex-row">
          <button
            type="button"
            onClick={onOpen}
            data-testid="transcription-bar-open"
            className="w-full sm:w-auto bg-blue-500 text-white text-sm font-medium rounded-md h-8 px-4 hover:bg-blue-600 transition-colors"
          >
            Open
          </button>
          <button
            type="button"
            onClick={onEnd}
            data-testid="transcription-bar-end"
            className="text-sm text-destructive hover:underline h-8 px-3 sm:ml-0 ml-auto"
          >
            End session
          </button>
        </div>
      </div>
    </div>
  );
}
