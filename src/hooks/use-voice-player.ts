/**
 * @file use-voice-player.ts
 * @description P1576 Part B: plays one voice note. The signed URL is fetched on the first play (never on
 * render), reused for a short while, and fetched again after it could have expired. When the browser
 * reports the link failed (a 403 after expiry), the note asks for a fresh one ONCE by itself and carries
 * on from where it was; a second failure with no playback in between is shown, and a tap tries afresh.
 * A recording the server says is gone is a final state, not an error. Only one note plays at a time.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getVoicePlaybackUrl } from '@/app/data/chat-voice-service';

/**
 * The server's link lives 2 minutes; one is reused for 90 seconds so a tap never lands on a dying link.
 */
export const URL_REUSE_MS = 90_000;

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'expired' | 'error';

/** How one try at starting playback ended. */
type Outcome = 'playing' | 'gone' | 'fetch-failed' | 'element-failed' | 'superseded';

/** Pauses whichever note is playing; set by the one that is. */
let pauseActive: (() => void) | null = null;
/**
 * Taps are numbered. A note whose play() resolves late checks whether a LATER tap has already started
 * playing: if so it steps aside, so the last note tapped is the one that ends up playing.
 */
let tapSeq = 0;
let playingSeq = 0;

export interface VoicePlayer {
  state: PlayerState;
  positionMs: number;
  toggle: () => Promise<void>;
  /** Moves the playhead. Before the first play it loads the note (the usual signed-URL flow) and plays from there. */
  seek: (ms: number) => void;
}

export function useVoicePlayer(messageId: string, hasAudio: boolean): VoicePlayer {
  const [state, setStateRaw] = useState<PlayerState>('idle');
  const [positionMs, setPositionMs] = useState(0);
  const stateRef = useRef<PlayerState>('idle');
  const setState = useCallback((next: PlayerState) => {
    stateRef.current = next;
    setStateRaw(next);
  }, []);
  const elRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<{ url: string; at: number } | null>(null);
  // The tap number of the start under way, or 0. A start that was stopped and replaced must not clear its successor's mark.
  const busyRef = useRef(0);
  // The one automatic refetch after a failure; spent until playback has progressed or a person taps.
  const retriedRef = useRef(false);
  const runRef = useRef<() => Promise<void>>(async () => {});
  // A position (seconds) asked for before the element had a link: applied as soon as it has one.
  const seekRef = useRef<number | null>(null);
  // What this note registers as "the one playing": cleared when it closes, so a later note never reaches a gone element.
  const pauseSelfRef = useRef<(() => void) | null>(null);
  // Bumped when this bubble is given another message or closed: a try still under way then drops out.
  const generationRef = useRef(0);

  /** A stopped start whose play() resolved anyway: pause it, unless a newer start of this bubble owns the element. */
  const silenceAbandoned = useCallback((el: HTMLAudioElement, tap: number) => {
    const newerOwnsElement = busyRef.current !== tap && busyRef.current !== 0;
    if (!newerOwnsElement && stateRef.current !== 'playing' && elRef.current === el) el.pause();
  }, []);

  /** One try: a link (cached or fresh) into the audio element, then play. */
  const playOnce = useCallback(async (element: () => HTMLAudioElement): Promise<Outcome> => {
    const tap = ++tapSeq;
    busyRef.current = tap;
    const generation = generationRef.current;
    setState('loading'); // from the tap until the sound runs: a second tap in this window stops the start
    try {
      const resumeAt = elRef.current?.currentTime ?? 0;
      let url = urlRef.current && Date.now() - urlRef.current.at < URL_REUSE_MS ? urlRef.current.url : null;
      if (!url) {
        try {
          url = await getVoicePlaybackUrl(messageId);
        } catch {
          return 'fetch-failed';
        }
        if (generationRef.current !== generation) return 'superseded';
        if (url === null) return 'gone';
        urlRef.current = { url, at: Date.now() };
      }
      const el = element();
      if (el.src !== url) {
        el.src = url;
        el.currentTime = resumeAt;
      }
      if (seekRef.current !== null) {
        el.currentTime = seekRef.current;
        seekRef.current = null;
      }
      await el.play();
      // Stopped (a second tap) or closed meanwhile. A newer start of this same bubble may own the element now:
      // leave it alone then. Otherwise this late start would sound behind a Play button, so silence it.
      if (generationRef.current !== generation) {
        silenceAbandoned(el, tap);
        return 'superseded';
      }
      if (playingSeq > tap) {
        el.pause(); // a note tapped after this one is already playing
        return 'superseded';
      }
      // Only a note that actually started takes over: one that failed to start leaves the playing one alone.
      const other = pauseActive;
      if (other && other !== pauseSelfRef.current) other();
      pauseSelfRef.current = () => el.pause();
      pauseActive = pauseSelfRef.current;
      playingSeq = tap;
      return 'playing';
    } catch {
      return generationRef.current === generation ? 'element-failed' : 'superseded'; // a rejection of a stopped start is no failure
    } finally {
      if (busyRef.current === tap) busyRef.current = 0;
    }
  }, [messageId, setState, silenceAbandoned]);

  /** One audio element per bubble, created on the first play, with its listeners attached once. */
  const element = useCallback((): HTMLAudioElement => {
    if (elRef.current) return elRef.current;
    const el = new Audio();
    el.addEventListener('timeupdate', () => {
      if (elRef.current !== el) return; // this bubble was given another message
      retriedRef.current = false; // it is playing: a later failure is a new one
      setPositionMs(el.currentTime * 1000);
    });
    el.addEventListener('pause', () => {
      if (elRef.current !== el) return; // this bubble was given another message
      if (stateRef.current === 'playing') setState('paused');
    });
    el.addEventListener('ended', () => {
      if (elRef.current !== el) return; // this bubble was given another message
      el.currentTime = 0;
      setPositionMs(0);
      setState('paused');
    });
    el.addEventListener('error', () => {
      if (elRef.current !== el) return; // this bubble was given another message
      if (busyRef.current) return; // a start is under way and will report its own failure
      urlRef.current = null; // the link died (expired, revoked)
      // Only a note that is playing recovers by itself; a paused one just fetches afresh on its next Play.
      if (stateRef.current !== 'playing') return;
      if (retriedRef.current) {
        setState('error');
        return;
      }
      retriedRef.current = true;
      void runRef.current();
    });
    elRef.current = el;
    return el;
  }, [setState]);

  const run = useCallback(async () => {
    const generationAtCall = generationRef.current;
    for (;;) {
      const outcome = await playOnce(element);
      if (generationRef.current !== generationAtCall) return; // stopped or closed: whoever did that set the state
      if (outcome === 'playing') {
        setState('playing');
        return;
      }
      if (outcome === 'gone') {
        setState('expired');
        return;
      }
      if (outcome === 'superseded') {
        setState('paused'); // a later note took over
        return;
      }
      if (outcome === 'fetch-failed' || retriedRef.current) {
        setState('error');
        return;
      }
      retriedRef.current = true; // the browser refused the link: ask for a fresh one, once
      urlRef.current = null;
    }
  }, [element, playOnce, setState]);
  runRef.current = run;

  const toggle = useCallback(async () => {
    if (!hasAudio || stateRef.current === 'expired') return;
    if (stateRef.current === 'playing') {
      elRef.current?.pause();
      return;
    }
    if (stateRef.current === 'loading') {
      // A tap while the start is still pending stops it: the pending start is superseded and its late result ignored.
      generationRef.current++;
      busyRef.current = 0;
      elRef.current?.pause();
      setState('paused');
      return;
    }
    if (busyRef.current) return;
    retriedRef.current = false;
    await run();
  }, [hasAudio, run, setState]);

  const seek = useCallback((ms: number) => {
    const st = stateRef.current;
    if (!hasAudio || st === 'expired') return;
    const target = Math.max(0, ms);
    setPositionMs(target);
    const el = elRef.current;
    if (el && el.src && st !== 'idle' && st !== 'error') {
      el.currentTime = target / 1000; // already linked: playing, paused or still starting
      return;
    }
    seekRef.current = target / 1000;
    if (st === 'idle' || st === 'error') void toggle();
  }, [hasAudio, toggle]);

  // Leaving the page, or being given another message, stops the sound and forgets everything about the old one.
  useEffect(() => () => {
    generationRef.current++;
    if (pauseActive && pauseActive === pauseSelfRef.current) pauseActive = null;
    pauseSelfRef.current = null;
    const el = elRef.current;
    if (el) {
      el.pause();
      el.removeAttribute('src');
    }
    elRef.current = null;
    urlRef.current = null;
    retriedRef.current = false;
    seekRef.current = null;
    busyRef.current = 0;
    stateRef.current = 'idle';
    setStateRaw('idle');
    setPositionMs(0);
  }, [messageId]);

  return { state, positionMs, toggle, seek };
}
