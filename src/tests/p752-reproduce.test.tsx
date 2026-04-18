/**
 * @file p752-reproduce.test.tsx
 * @description P752 canaries: three display bugs in session audio upload progress.
 *
 * H1 — total=0 race: status=uploading with total=0 → UI shows "0%" + "Don't close
 *      this tab yet." even though nothing has been queued. Post-session snapshot
 *      (clarity-live-page.tsx:3159) fires BEFORE the fire-and-forget
 *      saveChunk(...).then(enqueue) chain at :501-506 resolves.
 *
 * H2 — single chunk in flight: pending=total=1 → count-based progress (live-mode-
 *      view.tsx:284-286) computes (1-1)/1 = 0%. Bar pinned at 0% for the entire
 *      duration of the first chunk's PUT. No per-chunk or byte-level signal.
 *
 * H3 — retry invisible: queue flips state to 'retrying' on upload failure
 *      (chunk-upload-queue.ts:174) but UploadProgressState only carries
 *      'status' ('uploading' | 'complete' | 'failed'). Queue state never reaches UI.
 *
 * Canary gate: all three tests FAIL on current code. PASS after fix.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  PartnerLeftScreen,
  type UploadProgressState,
} from '@/app/components/partners/live-mode-view';

// PwaSessionEndBanner uses usePwaInstall() — only rendered when !isGuest.
// Tests pass isGuest={true} to skip the banner and avoid mocking the hook.

function renderScreen(uploadProgress: UploadProgressState | null) {
  return render(
    <MemoryRouter>
      <PartnerLeftScreen
        partnerName={null}
        sessionEnded={true}
        onStartNew={vi.fn()}
        isGuest={true}
        uploadProgress={uploadProgress}
        completedRounds={1}
      />
    </MemoryRouter>,
  );
}

describe('P752: session audio upload progress display bugs', () => {
  it('H1: must not show "Don\'t close this tab yet." when total=0 (nothing enqueued)', () => {
    // This is the snapshot written at clarity-live-page.tsx:3159 immediately
    // after `await stopRecording()`. The final chunk is handed off to IndexedDB
    // via fire-and-forget saveChunk().then(enqueue). For a short session where
    // no 30s tick ever fired, totalCount=0 at snapshot time → UI claims upload
    // is in progress with nothing to upload.
    const racingState: UploadProgressState = {
      pending: 0,
      total: 0,
      status: 'uploading',
    };
    renderScreen(racingState);

    // Symptom: the warning is visible even though there is nothing to protect.
    // Fix: either transition to 'complete' when total=0, or wait for enqueue
    // before claiming 'uploading'.
    expect(screen.queryByText(/don.t close this tab yet/i)).not.toBeInTheDocument();
  });

  it('H2: must show per-chunk progress signal while a chunk is actively uploading', () => {
    // Queue has enqueued 1 chunk, upload in flight, nothing completed yet.
    // Current UI: (total - pending) / total * 100 = (1 - 1) / 1 * 100 = 0%.
    // Progress bar is static at 0% for the full duration of the PUT.
    const singleChunkInFlight: UploadProgressState = {
      pending: 1,
      total: 1,
      status: 'uploading',
    };
    renderScreen(singleChunkInFlight);

    // Symptom: no text distinguishes "upload in progress" from "nothing started".
    // Fix Option A: per-chunk text like "Uploading chunk 1 of 1". Fix Option B:
    // byte-level progress via XHR.upload.onprogress. This canary asserts the
    // simpler Option A — if Option B is chosen instead, update the assertion
    // to match the chosen signal.
    expect(screen.queryByText(/chunk 1 of 1/i)).toBeInTheDocument();
  });

  it('H3: must surface "Retrying" label when queue state is retrying', () => {
    // chunk-upload-queue.ts:174 flips internal state to 'retrying' on a failed
    // upload attempt. UploadProgressState currently has no `state` field — the
    // UI only reads `status`, which stays 'uploading' across retry cycles.
    // Fix: extend UploadProgressState with `state: QueueState` and render a
    // retry-specific branch in PartnerLeftScreen.
    const retrying = {
      pending: 1,
      total: 1,
      status: 'uploading' as const,
      state: 'retrying' as const,
    } as UploadProgressState;
    renderScreen(retrying);

    // Symptom: retries are indistinguishable from a slow first upload. User
    // sees "0%" with "Don't close this tab yet." for up to ~5 minutes before
    // the drain timeout flips to 'failed'.
    expect(screen.queryByText(/retrying/i)).toBeInTheDocument();
  });
});
