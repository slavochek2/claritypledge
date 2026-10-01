/**
 * @file topics-page.tsx
 * @description P1347: /topics — vote for the next Clarity Night topic.
 *
 * Founder redesign: a plain list with stars ("everybody understands stars"), no videos,
 * and ONE "Add your own" at the top — no second ideas button per topic. A topic an
 * attendee adds joins the list at once and always sits above the host's topics.
 *
 * Voting needs sign-in: only people's votes count. Each voter chooses to show their photo
 * on their votes or vote anonymously. A topic's average and voters show ONLY on topics you
 * voted on (enforced in Postgres), so the crowd never anchors a first vote. Adding a topic
 * needs sign-in; only its title is public, a comment or link goes to the host.
 *
 * Votes are advisory. Nothing on this page picks the topic.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Star } from 'lucide-react';
import { SEO } from '@/app/components/seo';
import { useAuth } from '@/auth';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { getUpcomingEvents } from '@/app/data/api';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import {
  addTopic,
  getOpenTopics,
  isValidOptionalLink,
  rankTopics,
  rateTopic,
  setMyVotesPublic,
  type OpenTopic,
} from '@/app/data/topic-voting';
import { cn } from '@/lib/utils';

const STARS = [1, 2, 3, 4, 5] as const;
const SIGN_IN_HREF = `/login?redirect=${encodeURIComponent('/topics')}`;

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; topics: OpenTopic[] };

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function TopicsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [showPhoto, setShowPhoto] = useState(true);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [nextEventDate, setNextEventDate] = useState<string | null>(null);
  // Taps not yet confirmed by the server, laid OVER fetched data: a refetch that left
  // before a later tap can never wipe that tap, and a failed save rolls back.
  const [pending, setPending] = useState<Record<string, number>>({});
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const topics = await getOpenTopics().catch(() => null);
    if (seq !== loadSeq.current) return;
    // A failed REFRESH keeps what is on screen; only a failed first load shows the error.
    setState((s) => (topics ? { kind: 'ready', topics } : s.kind === 'ready' ? s : { kind: 'error' }));
  }, []);

  // Reload when sign-in state settles: what comes back depends on who is asking.
  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, user?.id, load]);

  useEffect(() => {
    getUpcomingEvents()
      .then((events) => {
        const now = Date.now();
        const next = events.find((e) => e.status === 'upcoming' && new Date(e.datetime).getTime() > now);
        if (next) setNextEventDate(next.datetime);
      })
      .catch(() => {});
  }, [load]);

  const handleRate = useCallback(
    async (topicId: string, rating: number) => {
      setPending((p) => ({ ...p, [topicId]: rating }));
      const ok = await rateTopic(topicId, rating, showPhoto).catch(() => false);
      if (ok) await load();
      setPending((p) => {
        if (p[topicId] !== rating) return p; // a later tap on this topic owns the slot
        const { [topicId]: _drop, ...rest } = p;
        return rest;
      });
      return ok;
    },
    [showPhoto, load],
  );

  // The photo choice follows the person's existing votes, if any.
  const knownPublic = state.kind === 'ready' ? state.topics.find((t) => t.myIsPublic !== null)?.myIsPublic : undefined;
  useEffect(() => {
    if (knownPublic !== undefined && knownPublic !== null) setShowPhoto(knownPublic);
  }, [knownPublic]);

  const togglePhoto = async (next: boolean) => {
    setShowPhoto(next);
    if (await setMyVotesPublic(next)) await load();
    else setShowPhoto(!next);
  };

  // The order is fixed for the visit: ranked once on first load, so a row never jumps
  // under the finger as votes arrive. A topic added later goes to the top (it is an
  // attendee's, and attendee topics sit above the host's).
  const orderRef = useRef<string[] | null>(null);
  const topics = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const byId = new Map(state.topics.map((t) => [t.id, t]));
    if (!orderRef.current) orderRef.current = rankTopics(state.topics).map((t) => t.id);
    const known = new Set(orderRef.current);
    const fresh = rankTopics(state.topics.filter((t) => !known.has(t.id))).map((t) => t.id);
    orderRef.current = [...fresh, ...orderRef.current.filter((id) => byId.has(id))];
    return orderRef.current.flatMap((id) => byId.get(id) ?? []);
  }, [state]);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-6 sm:pt-10">
      <SEO
        title="Vote for the next topic"
        description="Vote for the next Clarity Night topic, or add your own."
        url="/topics"
      />

      <header className="mb-5">
        <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          Vote for the next Clarity Night topic
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Give each topic 1 to 5 stars. The host decides, using your votes.
        </p>
        {nextEventDate && (
          <p className="mt-1 text-sm text-muted-foreground">Next Clarity Night: {formatEventDate(nextEventDate)}</p>
        )}
      </header>

      {state.kind === 'ready' && !authLoading && !user && (
        <div className="rounded-xl border border-border p-4 text-base text-foreground" data-testid="sign-in-to-vote">
          <Link to={SIGN_IN_HREF} className="font-medium text-blue-700 underline underline-offset-2">
            Sign in
          </Link>{' '}
          to vote or add a topic.
        </div>
      )}

      {state.kind === 'ready' && user && (
        <>
          <AddYourOwn onAdded={load} />
          <label className="mt-3 flex min-h-11 items-center gap-3 text-base text-foreground">
            <input
              type="checkbox"
              checked={showPhoto}
              onChange={(e) => togglePhoto(e.target.checked)}
              className="h-5 w-5 accent-blue-600"
            />
            Show my photo next to my votes
          </label>
        </>
      )}

      {state.kind === 'loading' && <ClarityPageLoader />}

      {state.kind === 'error' && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-base text-foreground">We could not load the topics.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-11"
            onClick={() => {
              setState({ kind: 'loading' });
              load();
            }}
          >
            Try again
          </Button>
        </div>
      )}

      {state.kind === 'ready' && topics.length === 0 && (
        <p className="mt-4 text-base text-muted-foreground">No topics yet. Add the first one.</p>
      )}

      {state.kind === 'ready' && topics.length > 0 && (
        <>
          <ul className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border" data-testid="topic-list">
            {topics.map((t) => (
              <TopicRow
                key={t.id}
                topic={t}
                shownRating={pending[t.id] ?? t.myRating}
                canVote={!!user}
                onRate={handleRate}
              />
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">
            You see the result of a topic after you vote on it. You can change your vote any time.
          </p>
        </>
      )}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function TopicRow({
  topic,
  shownRating,
  canVote,
  onRate,
}: {
  topic: OpenTopic;
  shownRating: number | null;
  canVote: boolean;
  onRate: (topicId: string, rating: number) => Promise<boolean>;
}) {
  const [failed, setFailed] = useState(false);

  const rate = async (r: number) => {
    setFailed(false);
    if (!(await onRate(topic.id, r))) setFailed(true);
  };

  const voters = topic.voters ?? [];

  return (
    <li className="p-3 sm:p-4" data-testid="topic-row">
      <p className="text-base font-medium leading-snug text-foreground">{topic.title}</p>
      {topic.source === 'community' && <p className="mt-0.5 text-xs text-muted-foreground">Added by an attendee</p>}

      {/* Signed out, the list is read-only: one sign-in prompt at the top, no dead stars here. */}
      {canVote && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <div className="-ml-2 flex" role="radiogroup" aria-label={`Stars for: ${topic.title}`}>
            {STARS.map((r) => {
              const filled = shownRating !== null && r <= shownRating;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={shownRating === r}
                  aria-label={`${r} ${r === 1 ? 'star' : 'stars'}`}
                  onClick={() => rate(r)}
                  className="flex h-11 w-11 items-center justify-center rounded-md"
                >
                  <Star aria-hidden className={cn('h-7 w-7', filled ? 'fill-blue-600 text-blue-600' : 'text-slate-300')} />
                </button>
              );
            })}
          </div>
          {failed && (
            <span className="text-sm text-red-600" role="alert">
              Not saved. Tap again.
            </span>
          )}
          {!failed && topic.ratingCount !== null && (
            <span className="text-sm text-muted-foreground" data-testid="topic-average">
              {topic.ratingAvg?.toFixed(1)} from {topic.ratingCount} {topic.ratingCount === 1 ? 'vote' : 'votes'}
            </span>
          )}
        </div>
      )}

      {voters.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5 p-0.5" aria-label="Voted" data-testid="topic-voters">
          {voters.slice(0, 12).map((v, i) => {
            // Round, with the blue pledger ring for pledgers, like every other person on the site.
            const face = (
              <GravatarAvatar name={v.name} photoUrl={v.avatarUrl ?? undefined} avatarColor={v.avatarColor ?? undefined} isPledger={v.hasPledged} size="sm" />
            );
            return (
              <li key={`${v.slug ?? v.name}-${i}`}>
                <MobileTooltip content={v.name}>
                  {v.slug ? (
                    <Link to={`/p/${v.slug}`} aria-label={v.name} className="inline-block">
                      {face}
                    </Link>
                  ) : (
                    <span aria-label={v.name} className="inline-block">{face}</span>
                  )}
                </MobileTooltip>
              </li>
            );
          })}
          {voters.length > 12 && <li className="self-center text-sm text-muted-foreground">+{voters.length - 12}</li>}
        </ul>
      )}
    </li>
  );
}

// ─── Add your own (the one input on the page) ───────────────────────────────

function AddYourOwn({ onAdded }: { onAdded: () => Promise<void> }) {
  const { user, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'added' | 'limit' | 'error'>('idle');

  if (!open) {
    return (
      <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" aria-hidden /> Add your own topic
      </Button>
    );
  }

  if (isLoading) return null;

  if (!user) {
    return (
      <div className="rounded-xl border border-border p-4 text-base text-foreground">
        <Link to={SIGN_IN_HREF} className="font-medium text-blue-700 underline underline-offset-2">
          Sign in
        </Link>{' '}
        to add a topic. Voting does not need sign-in.
      </div>
    );
  }

  const linkOk = isValidOptionalLink(link);
  const titleOk = title.trim().length >= 3;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titleOk || !linkOk || status === 'sending') return;
    setStatus('sending');
    const result = await addTopic({ title: title.trim(), note, link }).catch(() => 'error' as const);
    if (result === 'ok') {
      setTitle('');
      setNote('');
      setLink('');
      setStatus('added');
      await onAdded();
    } else {
      setStatus(result);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-xl border border-border p-4" data-testid="add-topic-form">
      <label htmlFor="new-topic" className="text-base font-semibold text-foreground">
        Your topic
      </label>
      <input
        id="new-topic"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          if (status !== 'sending') setStatus('idle');
        }}
        maxLength={140}
        placeholder="e.g. Is it OK to quit a job you hate?"
        className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base"
      />
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="Comment (optional)"
        aria-label="Comment (optional)"
        className="w-full rounded-lg border border-border bg-background p-3 text-base"
      />
      <input
        type="url"
        inputMode="url"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="YouTube or other link (optional)"
        aria-label="Link (optional)"
        className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base"
      />
      {!linkOk && <p className="text-sm text-red-600">Use a full link starting with https://</p>}
      <p className="text-xs text-muted-foreground">Everyone sees the topic. Only the host sees your comment and link.</p>
      {/* Shown once there is a topic to add, rather than sitting disabled (P955). */}
      {titleOk && (
        <Button type="submit" disabled={!linkOk || status === 'sending'} className="min-h-11 self-start">
          {status === 'sending' ? 'Adding…' : 'Add topic'}
        </Button>
      )}
      {status === 'added' && (
        <p className="text-sm text-green-700" aria-live="polite">
          Added. It's at the top of the list.
        </p>
      )}
      {status === 'limit' && <p className="text-sm text-red-600">You've added 5 topics today. Try again tomorrow.</p>}
      {status === 'error' && <p className="text-sm text-red-600">Not added. Try again in a moment.</p>}
    </form>
  );
}
