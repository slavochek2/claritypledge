/**
 * @file topic-parts.tsx
 * @description P1347's topic row and "Add a topic" dialog, shared by /topics and the P1389
 * evening close (its topics step). Moved out of topics-page.tsx unchanged so both surfaces
 * show the same stars, faces and dialog.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Plus, Star } from 'lucide-react';
import { useAuth } from '@/auth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { DETAILS_BUTTON_CLASS } from '@/app/components/shared/card-action-classes';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import {
  addTopic,
  clearTopicRating,
  getOpenTopics,
  rankTopics,
  rateTopic,
  setMyVotesPublic,
  type OpenTopic,
} from '@/app/data/topic-voting';
import { cn } from '@/lib/utils';

const STARS = [1, 2, 3, 4, 5] as const;
/** Title, then one line: stars · average · faces. Phones put that line under the title. */
const ROW_GRID = 'grid grid-cols-1 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_30rem] sm:items-center sm:gap-x-6';
const SIGN_IN_HREF = `/login?redirect=${encodeURIComponent('/topics')}`;
const SIGN_UP_HREF = `/signup?redirect=${encodeURIComponent('/topics')}`;

// ─── Row ─────────────────────────────────────────────────────────────────────


export function TopicRow({
  topic,
  shownRating,
  canVote,
  guest,
  onRate,
}: {
  topic: OpenTopic;
  shownRating: number | null;
  canVote: boolean;
  guest: boolean;
  onRate: (topicId: string, rating: number | null) => Promise<boolean>;
}) {
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Tapping your current star again takes the rating back.
  const rate = async (r: number) => {
    setFailed(false);
    if (!(await onRate(topic.id, r === shownRating ? null : r))) setFailed(true);
  };

  const voters = topic.voters ?? [];
  const result = !failed && canVote && shownRating !== null && topic.ratingCount !== null;
  const hasDetails = !!topic.why || topic.source === 'community';
  // A title with nothing to open is plain text, not a button that does nothing.
  const TitleTag = hasDetails ? 'button' : 'span';
  // Like point cards: an outlined "Details" at the card's right edge (top right on phones,
  // where the stars line is already full on a 320px screen).
  const detailsButton = (
    <button
      type="button"
      onClick={() => setExpanded((e) => !e)}
      aria-expanded={expanded}
      className={cn(DETAILS_BUTTON_CLASS, 'h-9 px-2.5')}
    >
      {expanded ? 'Less' : 'Details'}
      <ChevronDown aria-hidden className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
    </button>
  );

  return (
    <li data-testid="topic-row" className={cn(expanded && 'bg-muted/40')}>
      <div className={cn(ROW_GRID, 'px-1 py-2 sm:px-4')}>
        {/* Title, and a "Details" button like on point cards. The title opens the row too. */}
        <div className="flex items-start gap-2">
          <TitleTag
            {...(hasDetails ? { type: 'button' as const, onClick: () => setExpanded((e) => !e) } : {})}
            className="flex min-h-10 flex-1 items-center gap-2 text-left"
          >
            <span className="text-base font-semibold leading-snug text-foreground" data-testid="topic-title">
              {topic.title}
            </span>
            {topic.track === 'online' && (
              <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">Online</span>
            )}
          </TitleTag>
          {hasDetails && <span className="sm:hidden">{detailsButton}</span>}
        </div>

        <div className="flex flex-wrap items-center gap-x-1.5 sm:flex-nowrap sm:gap-x-2">
          {(canVote || guest) && (
            <div className="-ml-1.5 flex sm:ml-0" role="radiogroup" aria-label={`Stars for: ${topic.title}`}>
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
                    className="flex h-10 w-9 items-center justify-center rounded-md sm:h-11 sm:w-11"
                  >
                    <Star aria-hidden className={cn('h-6 w-6', filled ? 'fill-blue-600 text-blue-600' : 'text-slate-500')} />
                  </button>
                );
              })}
            </div>
          )}
          {result && (
            <span className="flex items-center gap-1.5 sm:gap-2" data-testid="topic-result">
              <span className="text-sm font-semibold text-foreground" data-testid="topic-average" title="Average rating">
                {topic.ratingAvg?.toFixed(1)}
              </span>
              <FacePile voters={voters} total={topic.ratingCount ?? 0} />
            </span>
          )}
          {hasDetails && <span className="ml-auto hidden sm:inline-flex">{detailsButton}</span>}
          {guest && shownRating !== null && (
            <p className="basis-full text-xs text-muted-foreground" data-testid="guest-save">
              <Link to={SIGN_UP_HREF} className="text-blue-600 hover:text-blue-700">
                Sign up
              </Link>
              {' or '}
              <Link to={SIGN_IN_HREF} className="text-blue-600 hover:text-blue-700">
                log in
              </Link>
              {' to save your rating'}
            </p>
          )}
          {failed && (
            <span className="text-sm text-red-600" role="alert">
              Not saved. Tap again.
            </span>
          )}
        </div>

      </div>

      {expanded && (
        <div className="px-1 pb-3 sm:px-4" data-testid="topic-details">
          {topic.why && (
            <p className="text-sm text-muted-foreground" data-testid="topic-why">
              {topic.why}
            </p>
          )}
          {topic.source === 'community' && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="topic-author">
              Added by
              {topic.author ? (
                <>
                  <span className="flex">
                    <GravatarAvatar name={topic.author.name} photoUrl={topic.author.avatarUrl ?? undefined} avatarColor={topic.author.avatarColor ?? undefined} isPledger={topic.author.hasPledged} size="sm" className="!h-5 !w-5 !text-[9px]" />
                  </span>
                  {topic.author.slug ? (
                    <Link to={`/p/${topic.author.slug}`} className="font-medium text-foreground hover:underline">
                      {topic.author.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-foreground">{topic.author.name}</span>
                  )}
                </>
              ) : (
                ' an attendee'
              )}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

type Voter = NonNullable<OpenTopic['voters']>[number];

/**
 * Social proof, like the pledger stack on the home page: up to 3 overlapping faces
 * (pledger ring kept, name on hover) and a grey "+N" for everyone else, anonymous
 * voters included. Not a list to click through.
 */
function FacePile({ voters, total }: { voters: Voter[]; total: number }) {
  const shown = voters.slice(0, 3);
  const pill = 'relative z-10 h-6 min-w-[1.5rem] items-center justify-center whitespace-nowrap rounded-full border-2 border-background bg-slate-300 px-1.5 text-xs font-medium text-slate-600 sm:h-7';
  const restPhone = total - Math.min(shown.length, 2);
  const restDesk = total - shown.length;
  return (
    <span className="flex items-center -space-x-1.5" aria-label={`${total} ${total === 1 ? 'vote' : 'votes'}`} data-testid="topic-voters">
      {shown.map((v, i) => (
        <MobileTooltip key={`${v.slug ?? v.name}-${i}`} content={v.name}>
          <span className={cn('flex rounded-full border-2 border-background', i === 2 && 'hidden sm:flex')}>
            <GravatarAvatar name={v.name} photoUrl={v.avatarUrl ?? undefined} avatarColor={v.avatarColor ?? undefined} isPledger={v.hasPledged} size="sm" className="!h-5 !w-5 !text-[9px] sm:!h-6 sm:!w-6 sm:!text-[10px]" />
          </span>
        </MobileTooltip>
      ))}
      {restPhone > 0 && <span className={cn(pill, 'flex sm:hidden')}>+{restPhone}</span>}
      {restDesk > 0 && <span className={cn(pill, 'hidden sm:flex')}>+{restDesk}</span>}
    </span>
  );
}

// ─── Add your own (the one input on the page) ───────────────────────────────

/** Pulls the first https link out of the comment box; the rest stays the comment. */
function splitNoteAndLink(text: string): { note: string; link: string } {
  const m = text.match(/https:\/\/\S+/);
  if (!m) return { note: text.trim(), link: '' };
  return { note: text.replace(m[0], '').replace(/\s+/g, ' ').trim(), link: m[0] };
}

/** `secondary`: inside a flow whose main action is elsewhere (the P1389 close's Continue), the
 *  trigger is outlined so it does not compete with it. /topics keeps the solid blue. */
export function AddYourOwn({ onAdded, secondary = false }: { onAdded: () => Promise<void>; secondary?: boolean }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [extra, setExtra] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [status, setStatus] = useState<'idle' | 'empty' | 'long' | 'sending' | 'limit' | 'error'>('idle');

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setStatus('idle');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'sending') return;
    if (title.trim().length < 3) return setStatus('empty');
    const { note, link } = splitNoteAndLink(extra);
    if (note.length > 240) return setStatus('long');
    setStatus('sending');
    const result = await addTopic({ title: title.trim(), note, link, anonymous }).catch(() => 'error' as const);
    if (result === 'ok') {
      setTitle('');
      setExtra('');
      setAnonymous(false);
      setStatus('idle');
      setOpen(false);
      await onAdded();
    } else {
      setStatus(result);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <Button type="button" variant={secondary ? 'outline' : 'default'} className={cn('min-h-11 self-start', secondary ? 'rounded-full' : 'bg-blue-500 text-white hover:bg-blue-700')} onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" aria-hidden /> Suggest a topic
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Suggest a topic</DialogTitle>
        </DialogHeader>
        {!user ? (
          <p className="text-base text-foreground">
            <Link to={SIGN_IN_HREF} className="font-medium text-blue-700 underline underline-offset-2">
              Sign in
            </Link>{' '}
            to suggest a topic.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3" data-testid="add-topic-form">
            {/* Founder (2026-10-04): a topic, then a specific expert — not "a comment or YouTube link". */}
            <label htmlFor="new-topic" className="text-sm font-semibold text-foreground">
              Topic
            </label>
            <input
              id="new-topic"
              autoFocus
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (status === 'empty') setStatus('idle');
              }}
              maxLength={140}
              placeholder="For example: how to disagree well at work"
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base"
            />
            <label htmlFor="new-topic-expert" className="text-sm font-semibold text-foreground">
              Who knows this topic well? <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="new-topic-expert"
              value={extra}
              onChange={(e) => {
                setExtra(e.target.value);
                if (status === 'long') setStatus('idle');
              }}
              maxLength={1000}
              rows={3}
              placeholder="A name, or a link to a talk, a book or a video."
              className="w-full rounded-lg border border-border bg-background p-3 text-base placeholder:italic placeholder:text-gray-400"
            />
            <label className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4 accent-blue-600" />
              Make my suggestion anonymous
            </label>
            {status === 'empty' && <p className="text-sm text-red-600">Write a topic first.</p>}
            {status === 'long' && <p className="text-sm text-red-600">Keep the expert suggestion under 240 characters.</p>}
            {status === 'limit' && <p className="text-sm text-red-600">You've added 5 topics today. Try again tomorrow.</p>}
            {status === 'error' && <p className="text-sm text-red-600">Not added. Try again in a moment.</p>}
            <Button type="submit" className="min-h-11 self-end bg-blue-500 text-white hover:bg-blue-700">
              {status === 'sending' ? 'Submitting…' : 'Submit'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── The whole voting list (sort, add, rows, hide-my-photo) ───────
/** Stars a signed-out visitor tapped, kept until they sign in, then saved. */
const GUEST_STORE = 'p1347-guest-ratings';
function readGuest(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(GUEST_STORE) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function writeGuest(v: Record<string, number>) {
  try {
    if (Object.keys(v).length) sessionStorage.setItem(GUEST_STORE, JSON.stringify(v));
    else sessionStorage.removeItem(GUEST_STORE);
  } catch {
    /* storage blocked: the stars still show for this visit */
  }
}

type SortBy = 'suggested' | 'mine' | 'average';

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; topics: OpenTopic[] };

export interface TopicListFooter { total: number }

/**
 * P1347's list, whole: /topics renders it with its pinned bar (`renderFooter`); the P1389
 * close renders it inline with a visible "Show more" at the end of the list (founder: reuse
 * fully, not a slimmed copy). `onProgress` tells a host flow whether this person has rated
 * or added anything yet.
 */
export function TopicVotingList({
  renderFooter,
  onProgress,
  title,
  stickyTop,
}: {
  renderFooter?: (f: TopicListFooter) => ReactNode;
  onProgress?: (p: { rated: boolean; ratedCount: number; added: boolean }) => void;
  /** P1389: a title kept with the list settings at the top while the rows scroll. */
  title?: ReactNode;
  /** P1389: pixels from the top where the title + settings stick (under a fixed header). */
  stickyTop?: number;
}) {
  const { user, isLoading: authLoading } = useAuth();
  const [showPhoto, setShowPhoto] = useState(true);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Taps not yet confirmed by the server, laid OVER fetched data: a refetch that left
  // before a later tap can never wipe that tap, and a failed save rolls back.
  const [pending, setPending] = useState<Record<string, number | null>>(() => readGuest());
  // Sorting is the viewer's choice and is applied once per choice, so rows never move under a tap.
  const [sortBy, setSortBy] = useState<SortBy>('suggested');
  const [sortedIds, setSortedIds] = useState<string[] | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const topics = await getOpenTopics().catch(() => null);
    if (seq !== loadSeq.current) return;
    // A failed REFRESH keeps what is on screen; only a failed first load shows the error.
    setState((s) => (topics ? { kind: 'ready', topics } : s.kind === 'ready' ? s : { kind: 'error' }));
  }, []);

  // Signed in now with stars tapped while signed out: once this person's own votes have
  // loaded, save the stars with their existing photo choice (hidden if any vote is hidden),
  // keep any that failed for the next try, then reload.
  const signedInLoaded = state.kind === 'ready' && !!user && !authLoading;
  useEffect(() => {
    if (!signedInLoaded || state.kind !== 'ready') return;
    const g = readGuest();
    const ids = Object.keys(g);
    if (!ids.length) return;
    const isPublic = !state.topics.some((t) => t.myIsPublic === false);
    writeGuest({});
    Promise.all(ids.map(async (id) => [id, await rateTopic(id, g[id], isPublic).catch(() => false)] as const)).then((done) => {
      const failed = Object.fromEntries(done.filter(([, ok]) => !ok).map(([id]) => [id, g[id]]));
      writeGuest(failed);
      setPending((p) => Object.fromEntries(Object.entries(p).filter(([id]) => !(id in g) || id in failed)));
      load();
    });
    // Runs once per sign-in; state changes after the reload must not re-fire it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedInLoaded]);

  // Reload when sign-in state settles: what comes back depends on who is asking.
  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, user?.id, load]);

  const handleRate = useCallback(
    async (topicId: string, rating: number | null) => {
      setPending((p) => ({ ...p, [topicId]: rating }));
      if (!user) {
        // Signed out: keep the stars on screen and save them after sign-in.
        const { [topicId]: _prev, ...rest } = readGuest();
        writeGuest(rating === null ? rest : { ...rest, [topicId]: rating });
        return true;
      }
      const ok = await (rating === null ? clearTopicRating(topicId) : rateTopic(topicId, rating, showPhoto)).catch(() => false);
      if (ok) await load();
      setPending((p) => {
        if (p[topicId] !== rating) return p; // a later tap on this topic owns the slot
        const { [topicId]: _drop, ...rest } = p;
        return rest;
      });
      return ok;
    },
    [showPhoto, load, user],
  );

  // The photo choice follows the person's existing votes, if any.
  const knownPublic =
    state.kind === 'ready' && state.topics.some((t) => t.myIsPublic !== null)
      ? !state.topics.some((t) => t.myIsPublic === false)
      : undefined;
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

  const listed = useMemo(() => {
    if (!sortedIds) return topics;
    const pos = new Map(sortedIds.map((id, i) => [id, i]));
    return [...topics].sort((a, b) => (pos.get(a.id) ?? -1) - (pos.get(b.id) ?? -1));
  }, [topics, sortedIds]);

  const changeSort = (next: SortBy) => {
    setSortBy(next);
    if (next === 'suggested') return setSortedIds(null);
    const key = (t: OpenTopic) => (next === 'mine' ? (t.id in pending ? pending[t.id] : t.myRating) : t.ratingAvg) ?? -1;
    setSortedIds([...topics].sort((a, b) => key(b) - key(a)).map((t) => t.id));
  };

  const [added, setAdded] = useState(false);
  const onAdded = useCallback(async () => { setAdded(true); await load(); }, [load]);
  const ratedCount = topics.filter((t) => (t.id in pending ? pending[t.id] : t.myRating) != null).length;
  const rated = ratedCount > 0;
  useEffect(() => { onProgress?.({ rated, ratedCount, added }); }, [rated, ratedCount, added, onProgress]);
  // Founder (2026-10-05): every topic is on the page, no "Show more" — a vote is a comparison, and
  // rows behind a button were never seen, so the first page won by position, not preference.
  const footer: TopicListFooter = { total: topics.length };

  const pinned = stickyTop !== undefined;
  const sortControl = (
    <label className="relative inline-flex h-10 shrink-0 items-center rounded-full border border-border pl-3 pr-8 text-foreground hover:bg-muted/60">
      <span className={cn('text-muted-foreground', pinned && 'max-sm:sr-only')}>Sort:</span>
      <select
        aria-label="Sort by"
        value={sortBy}
        onChange={(e) => changeSort(e.target.value as SortBy)}
        className="h-full cursor-pointer appearance-none bg-transparent pl-1 text-base font-medium focus:outline-none md:text-sm"
      >
        <option value="suggested">Recommended</option>
        <option value="mine">Rated by me</option>
        <option value="average">Highest rated</option>
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 h-4 w-4 text-muted-foreground" />
    </label>
  );
  // P1389 (founder): the photo choice sits at the top with the list's other settings.
  const photoChoice = user && (
    <label className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
      <input type="checkbox" checked={!showPhoto} onChange={(e) => togglePhoto(!e.target.checked)} className="h-4 w-4 accent-blue-600" />
      Hide my photo on my votes
    </label>
  );

  return (
    <>
      {!pinned && title}
      {state.kind === 'ready' && !authLoading && (
        <div
          className={pinned ? 'sticky z-30 -mx-4 space-y-2 border-b border-border bg-background px-4 pb-1 pt-3' : undefined}
          style={pinned ? { top: stickyTop } : undefined}
          data-testid="topics-sticky"
        >
          {pinned && title}
          {/* List settings, right above the table: sort left, anonymous right. Pinned (P1389): one
              row of controls and the photo choice as a small line, so the rows keep the screen. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm text-muted-foreground">
            {sortControl}
            {pinned ? (
              <AddYourOwn onAdded={onAdded} />
            ) : (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {photoChoice}
                <AddYourOwn onAdded={onAdded} />
              </div>
            )}
          </div>
          {pinned && photoChoice}
        </div>
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
          <ul className="mt-3 flex flex-col divide-y divide-border border-t border-border" data-testid="topic-list">
            {listed.map((t) => (
              <TopicRow
                key={t.id}
                topic={t}
                shownRating={t.id in pending ? (pending[t.id] ?? null) : t.myRating}
                canVote={!!user}
                guest={!user}
                onRate={handleRate}
              />
            ))}
          </ul>
          {renderFooter?.(footer)}
        </>
      )}
    </>
  );
}
