/**
 * @file mirror-provider.tsx
 * @description P1520: the mirror's replies and its face, for the signed-in owner.
 *
 * When the owner's own message lands in their mirror (a note, a Clarify, or an @mirror ask from a
 * channel), the mirror is asked to answer it — once per message on this device; the server keeps one
 * job per message, so a second device or a retry never pays or answers twice. The answer arrives like
 * any message (Realtime, or the resync this asks for when a confirmed answer did not arrive live).
 *
 * Off when the server says the mirror cannot answer on this project (prod, until the privacy policy
 * covers sending other people's messages to the model): then nothing is requested and no AI control
 * is shown. The portrait is read either way, so a face painted elsewhere still shows.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  askMirror,
  getMirrorAvailability,
  getMirrorProfile,
  listMirrorJobs,
  newMirrorFace,
  requestMirrorReply,
  setMirrorGender,
  type MirrorGender,
  type MirrorProfile,
} from '@/app/data/mirror-service';
import { ChatContext, type ChatContextValue } from './chat-state';
import { MirrorContext, type MirrorContextValue, type MirrorReplyStatus, type PortraitStatus } from './mirror-state';

/** A job still "running" this long after it was created died with its request: offer Try again. */
const STALE_RUNNING_MS = 3 * 60_000;
/** Re-read a job that another device (or a slow call) is still running. */
const RECHECK_MS = 20_000;

/** Waits before re-asking whether the mirror is on, after a failed check. */
const AVAILABILITY_RETRY_MS = [1_000, 3_000, 9_000];

export function MirrorProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const chat = useContext(ChatContext);
  if (!enabled || !chat) return <>{children}</>;
  return <MirrorProviderInner chat={chat}>{children}</MirrorProviderInner>;
}

function MirrorProviderInner({ chat, children }: { chat: ChatContextValue; children: ReactNode }) {
  const { subscribe, userId, resync } = chat;
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<MirrorProfile | null>(null);
  const [statuses, setStatuses] = useState<Record<string, MirrorReplyStatus>>({});
  const [portraitStatus, setPortraitStatus] = useState<PortraitStatus>('idle');

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const mirrorId = chat.chats.find((c) => c.kind === 'mirror')?.conversationId ?? null;
  const mirrorIdRef = useRef(mirrorId);
  mirrorIdRef.current = mirrorId;
  /** Messages this device already asked about (a late Realtime copy of the same message asks nothing). */
  const asked = useRef(new Set<string>());
  /** Messages whose answer has been seen. */
  const answered = useRef(new Set<string>());
  const portraitTried = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setStatus = useCallback((id: string, s: MirrorReplyStatus | undefined) => {
    setStatuses((prev) => {
      if (prev[id] === s) return prev;
      if (s) return { ...prev, [id]: s };
      return Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id));
    });
  }, []);

  useEffect(() => {
    // A failed check is retried; only the server's own answer (or running out of retries) settles it.
    // `stale` drops answers that land after the user changed or the provider unmounted.
    let stale = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    // A failed profile read is retried on the same schedule as the availability check.
    const loadProfile = (attempt = 0) =>
      getMirrorProfile().then(
        (p) => !stale && mounted.current && setProfile(p),
        () => {
          if (stale || !mounted.current || attempt >= AVAILABILITY_RETRY_MS.length) return;
          timers.push(setTimeout(() => void loadProfile(attempt + 1), AVAILABILITY_RETRY_MS[attempt]));
        },
      );
    const check = (attempt: number) => {
      getMirrorAvailability()
        .catch(() => null)
        .then((on) => {
          if (stale || !mounted.current) return;
          if (on !== null || attempt >= AVAILABILITY_RETRY_MS.length) {
            setEnabled(on === true);
          } else timer = setTimeout(() => check(attempt + 1), AVAILABILITY_RETRY_MS[attempt]);
        });
    };
    check(0);
    void loadProfile();
    return () => {
      stale = true;
      clearTimeout(timer);
      timers.forEach(clearTimeout);
    };
  }, [userId]);

  const recheck = useCallback(
    // `since` is when this client asked (or retried): a retried job restarts on the server, so its age
    // counts from the later of that and the job's creation. Clients cannot read the job's started_at.
    (id: string, since: number = Date.now()) => {
      window.setTimeout(() => {
        if (!mounted.current || answered.current.has(id)) return;
        // A failed or empty read keeps polling, but not past the limit a slow job gets.
        const pollAgain = () => {
          if (!mounted.current || answered.current.has(id)) return;
          if (Date.now() - since > STALE_RUNNING_MS) setStatus(id, 'failed');
          else recheck(id, since);
        };
        listMirrorJobs([id]).then((jobs) => {
          const j = jobs.get(id);
          if (answered.current.has(id)) return;
          if (!j) pollAgain();
          else if (j.state === 'done') {
            setStatus(id, undefined);
            resync();
          } else if (j.state === 'running' || j.state === 'queued') {
            const started = Math.max(new Date(j.createdAt).getTime(), since);
            if (Date.now() - started > STALE_RUNNING_MS) setStatus(id, 'failed');
            else recheck(id, since);
          } else setStatus(id, j.state === 'capped' ? 'capped' : j.state === 'failed' ? 'failed' : undefined);
        }, pollAgain);
      }, RECHECK_MS);
    },
    [setStatus, resync],
  );

  /** Own mirror messages that arrived before the server said whether the mirror is on. */
  const waitingForAvailability = useRef(new Set<string>());
  const run = useCallback(
    (id: string) => {
      if (answered.current.has(id)) return;
      if (enabledRef.current === null) {
        waitingForAvailability.current.add(id);
        return;
      }
      if (!enabledRef.current) return;
      setStatus(id, 'thinking');
      requestMirrorReply(id).then(
        (state) => {
          if (!mounted.current || answered.current.has(id)) return;
          switch (state) {
            case 'done':
              setStatus(id, undefined);
              resync(); // the answer is stored; read it now in case its live copy was missed
              break;
            case 'running':
              recheck(id);
              break;
            case 'capped':
              setStatus(id, 'capped');
              break;
            case 'failed':
              setStatus(id, 'failed');
              break;
            case 'disabled':
              setEnabled(false);
              setStatus(id, undefined);
              break;
            default:
              setStatus(id, undefined);
          }
        },
        () => mounted.current && !answered.current.has(id) && setStatus(id, 'failed'),
      );
    },
    [setStatus, resync, recheck],
  );

  // Availability arrived: ask for the messages that came in before it (or forget them when the mirror is off).
  useEffect(() => {
    if (enabled === null) return;
    const ids = [...waitingForAvailability.current];
    waitingForAvailability.current.clear();
    if (enabled) ids.forEach((id) => run(id));
  }, [enabled, run]);

  /** Explicit (Try again) or automatic (a new own message in the mirror). Automatic asks once per message. */
  const requestReply = useCallback(
    (id: string) => {
      asked.current.add(id);
      run(id);
    },
    [run],
  );

  useEffect(
    () =>
      subscribe((e) => {
        if (e.type === 'resync') return;
        const m = e.type === 'sent' ? e.message : e.event.message;
        const inserted = e.type === 'sent' || e.event.type === 'INSERT';
        if (!inserted) return;
        if (m.kind === 'agent' && m.replyToId) {
          answered.current.add(m.replyToId);
          setStatus(m.replyToId, undefined);
          return;
        }
        if (
          m.authorId === userId &&
          m.conversationId === mirrorIdRef.current &&
          (m.kind === 'message' || m.kind === 'clarify') &&
          !m.isDeleted &&
          !asked.current.has(m.id)
        ) {
          requestReply(m.id);
        }
      }),
    [subscribe, userId, requestReply, setStatus],
  );

  const loadStatuses = useCallback(
    (ids: string[]) => {
      if (!enabledRef.current) return;
      const want = ids.filter((id) => !answered.current.has(id) && !asked.current.has(id));
      if (want.length === 0) return;
      listMirrorJobs(want).then(
        (jobs) => {
          if (!mounted.current) return;
          jobs.forEach((j, id) => {
            if (answered.current.has(id) || asked.current.has(id)) return;
            if (j.state === 'failed' || j.state === 'queued') setStatus(id, 'failed');
            else if (j.state === 'capped') setStatus(id, 'capped');
            else if (j.state === 'running') {
              if (Date.now() - new Date(j.createdAt).getTime() > STALE_RUNNING_MS) setStatus(id, 'failed');
              else {
                setStatus(id, 'thinking');
                recheck(id);
              }
            }
          });
        },
        () => undefined,
      );
    },
    [setStatus, recheck],
  );

  const ask = useCallback(
    async (channelId: string, body: string) => {
      const row = await askMirror(channelId, body, crypto.randomUUID());
      if (!asked.current.has(row.id)) requestReply(row.id);
      return row;
    },
    [requestReply],
  );

  const refreshProfile = useCallback(async () => {
    try {
      const p = await getMirrorProfile();
      if (mounted.current) setProfile(p);
    } catch {
      /* keep the face that is shown */
    }
  }, []);

  const painting = useRef(false);
  const newFace = useCallback(async () => {
    if (!enabledRef.current || painting.current) return;
    painting.current = true;
    setPortraitStatus('painting');
    try {
      const state = await newMirrorFace();
      if (!mounted.current) return;
      if (state === 'done') {
        await refreshProfile();
        setPortraitStatus('idle');
      } else if (state === 'running') {
        // Already being painted (another tab): read the result once it is likely there.
        window.setTimeout(() => {
          void refreshProfile().then(() => mounted.current && setPortraitStatus('idle'));
        }, RECHECK_MS);
      } else if (state === 'capped') setPortraitStatus('capped');
      else if (state === 'disabled') {
        setEnabled(false);
        setPortraitStatus('idle');
      } else setPortraitStatus('failed');
    } catch {
      if (mounted.current) setPortraitStatus('failed');
    } finally {
      painting.current = false;
    }
  }, [refreshProfile]);

  const ensurePortrait = useCallback(() => {
    if (!enabledRef.current || portraitTried.current || !profile || profile.portraitUrl) return;
    portraitTried.current = true;
    void newFace();
  }, [profile, newFace]);
  // Availability can arrive after the mirror was opened: ensurePortrait is re-offered when it does.
  const [ensureWanted, setEnsureWanted] = useState(false);
  const ensurePortraitSoon = useCallback(() => {
    setEnsureWanted(true);
    ensurePortrait();
  }, [ensurePortrait]);
  useEffect(() => {
    if (ensureWanted && enabled) ensurePortrait();
  }, [ensureWanted, enabled, ensurePortrait]);

  const setGender = useCallback(async (gender: MirrorGender | null) => {
    await setMirrorGender(gender);
    if (mounted.current) setProfile((p) => (p ? { ...p, gender } : p));
  }, []);

  const statusFor = useCallback((id: string) => statuses[id], [statuses]);

  const value = useMemo<MirrorContextValue>(
    () => ({ enabled, profile, portraitStatus, statusFor, requestReply, loadStatuses, ask, newFace, ensurePortrait: ensurePortraitSoon, setGender }),
    [enabled, profile, portraitStatus, statusFor, requestReply, loadStatuses, ask, newFace, ensurePortraitSoon, setGender],
  );
  return <MirrorContext.Provider value={value}>{children}</MirrorContext.Provider>;
}
