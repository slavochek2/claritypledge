import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A soft wooden knock, made with Web Audio. No files, no dependency.
 *
 * The AudioContext is created lazily inside the first call, and every call comes from
 * a user gesture (a tap, a key press, a "play" click), so browsers allow it to start.
 * Muting stops new sounds; it does not stop the visual pulses, so the page still works
 * with sound off.
 */
export function useKnock() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(
    () => () => {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
    },
    [],
  );

  const ensureContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        ctxRef.current = new Ctor();
      } catch {
        return null;
      }
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    return ctx;
  }, []);

  /** Plays one knock `delaySec` from now. Returns nothing; failures are silent by design. */
  const knock = useCallback(
    (delaySec = 0) => {
      if (mutedRef.current) return;
      const ctx = ensureContext();
      if (!ctx) return;
      const start = ctx.currentTime + 0.005 + Math.max(0, delaySec);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, start);
      osc.frequency.exponentialRampToValueAtTime(320, start + 0.07);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.13);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    },
    [ensureContext],
  );

  /** Stops anything already scheduled, by dropping the context. The next knock makes a new one. */
  const silence = useCallback(() => {
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
  }, []);

  return { knock, silence, muted, setMuted };
}
