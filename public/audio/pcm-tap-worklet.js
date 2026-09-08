/**
 * P1236 Decision 1: the PCM tap.
 *
 * An AudioWorkletProcessor must be loaded from its own URL (`addModule`), which is why
 * this lives in `public/` rather than in `src/` — it is not bundled, it is fetched. Keep
 * it dependency-free and framework-free for the same reason: nothing here goes through
 * Vite's transform.
 *
 * Its only job is to hand raw Float32 frames to the main thread. The ring buffer, the 4 s
 * cadence, the 1 s lead-in and the WAV encoding all live in `src/lib/audio/slice-recorder.ts`,
 * where they are testable. A worklet runs on the audio render thread: work done here is
 * work done under a hard real-time deadline, and dropping frames is exactly the failure
 * this whole feature exists to avoid.
 *
 * Why a tap at all, rather than a MediaRecorder: Finding 8 needs slice N to contain audio
 * already emitted in slice N-1. A forward-streaming encoder cannot re-emit past audio;
 * a sample buffer can, by moving one read pointer. And only chunk_000 of a MediaRecorder
 * stream carries the WebM/EBML header, so a chunk is not independently transcribable.
 *
 * Verified on the physical device this spec exists for (Galaxy S22, Chrome 152, 2026-09-08):
 * this shape delivered exactly 48000 frames/second in every second of a run, including the
 * second in which a MediaRecorder attached to the SAME MediaStream. See
 * scripts/p1236-stagea-probe/.
 */
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      // A copy, not the view: the render quantum's backing buffer is reused by the audio
      // thread on the very next call, so posting the view would deliver whatever the
      // microphone recorded 3 ms later instead of what was captured here.
      this.port.postMessage(channel.slice(0));
    }
    // Always true: returning false lets the node be garbage-collected mid-session, and
    // an input that is momentarily silent is not an input that has gone away.
    return true;
  }
}

registerProcessor('pcm-tap', PcmTap);
