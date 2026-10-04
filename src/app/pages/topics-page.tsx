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
import { useGoBack } from '@/app/hooks/use-go-back';
import { ArrowLeft, ChevronDown, Plus, Star } from 'lucide-react';
import { SEO } from '@/app/components/seo';
import { useAuth } from '@/auth';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { DETAILS_BUTTON_CLASS } from '@/app/components/shared/card-action-classes';
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
/** Attendee topics, then the host's in backlog order: the first this many are shown. */
const TOP_COUNT = 8;
/** Title, then one line: stars · average · faces. Phones put that line under the title. */
const ROW_GRID = 'grid grid-cols-1 gap-y-0.5 sm:grid-cols-[minmax(0,1fr)_30rem] sm:items-center sm:gap-x-6';
/** P1414: embedded in a ~600px card column there is no room for the 30rem stars column — keep the phone layout at every width. */
const ROW_STACKED = 'grid grid-cols-1 gap-y-0.5';
const signInHref = (back: string) => `/login?redirect=${encodeURIComponent(back)}`;
const signUpHref = (back: string) => `/signup?redirect=${encodeURIComponent(back)}`;
/**
 * Stars a signed-out visitor tapped, kept until they sign in, then saved.
 * P1414: localStorage, not sessionStorage — the email sign-in link can open in a new tab, which
 * has its own sessionStorage, and the stars were lost. Kept a day, so a shared device does not
 * hand one visitor's stars to whoever signs in next week.
 */
const GUEST_STORE = 'p1347-guest-ratings';
const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
function readGuest(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_STORE) ?? '{}') as { at?: number; r?: Record<string, number> };
    if (!raw.at || !raw.r || Date.now() - raw.at > GUEST_TTL_MS) return {};
    return raw.r;
  } catch {
    return {};
  }
}
function writeGuest(v: Record<string, number>) {
  try {
    if (Object.keys(v).length) localStorage.setItem(GUEST_STORE, JSON.stringify({ at: Date.now(), r: v }));
    else localStorage.removeItem(GUEST_STORE);
  } catch {
    /* storage blocked: the stars still show for this visit */
  }
}

type SortBy = 'suggested' | 'mine' | 'average';

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; topics: OpenTopic[] };


type TopicsPageProps = {
  /**
   * P1414: rendered inside another page (the next Clarity Night's event page) — no SEO, no
   * page heading, no pinned bar, and nothing at all until there are topics to rate.
   */
  embedded?: boolean;
  /** Where sign-in and sign-up return to — the event page when embedded, so the visitor lands back where they rated. */
  returnTo?: string;
  /** Embedded only: the host page's spacing, applied to the section so an absent section leaves no divider. */
  className?: string;
};

export function TopicsPage({ embedded = false, returnTo = '/topics', className }: TopicsPageProps = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const goBack = useGoBack('/');
  const [showPhoto, setShowPhoto] = useState(true);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Taps not yet confirmed by the server, laid OVER fetched data: a refetch that left
  // before a later tap can never wipe that tap, and a failed save rolls back.
  // A short list first (8 more per tap), so nobody thinks they must rate everything.
  const step = TOP_COUNT;
  const [shown, setShown] = useState(step);
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

  // P1414: embedded, the section is absent rather than a spinner, an error box or an empty frame.
  if (embedded && (state.kind !== 'ready' || authLoading || topics.length === 0)) return null;

  return (
    <div className={embedded ? cn('w-full', className) : 'mx-auto w-full max-w-4xl px-4 pb-0 pt-6 sm:pt-10'} data-testid={embedded ? 'topic-vote-embed' : undefined}>
      {!embedded && <SEO
        title="Vote for the next topic"
        description="Vote for the next Clarity Night topic, or add your own."
        url="/topics"
      />}

      {embedded ? (
        <header className="mb-3">
          <h2 className="text-lg font-semibold leading-tight text-foreground sm:text-xl">Vote for this night's topic</h2>
          <p className="mt-1 text-base text-muted-foreground">
            This night's topic is chosen with you. Rate the ones you'd enjoy talking about, and you'll see how others rated after you rate.
          </p>
        </header>
      ) : (
      <header className="mb-5">
        <div>
        <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          Help pick the next Clarity Night topic
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Rate the topics you like. You'll see results after you rate.
        </p>
        </div>
      </header>
      )}

      {state.kind === 'ready' && !authLoading && (
        <>
          {/* List settings, right above the table: sort left, anonymous right. */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <label className="relative inline-flex h-10 items-center rounded-full border border-border pl-3 pr-8 text-foreground hover:bg-muted/60">
              <span className="text-muted-foreground">Sort:</span>
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <AddYourOwn onAdded={load} returnTo={returnTo} quiet={embedded} />
            </div>
          </div>
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
          <ul className="mt-3 flex flex-col divide-y divide-border border-t border-border" data-testid="topic-list">
            {listed.slice(0, shown).map((t) => (
              <TopicRow
                key={t.id}
                topic={t}
                shownRating={t.id in pending ? (pending[t.id] ?? null) : t.myRating}
                canVote={!!user}
                guest={!user}
                onRate={handleRate}
                returnTo={returnTo}
                linksInNewTab={embedded}
                stacked={embedded}
              />
            ))}
          </ul>
          {user && (
            <label className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={!showPhoto}
                onChange={(e) => togglePhoto(!e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              Hide my photo on my votes
            </label>
          )}
          {embedded ? (
            // Embedded: same controls as /topics (founder), minus the pinned bar — "Show 8 more" sits in the section.
            topics.length > shown && (
              // Same button as the closing sequence's list (P1389): centred, blue outline, rounded.
              <div className="mt-4 flex justify-center">
                <Button type="button" variant="outline" onClick={() => setShown((n) => n + step)} className="min-h-11 rounded-full border-blue-600 px-5 text-blue-600 hover:bg-blue-50 hover:text-blue-700">
                  Show {Math.min(step, topics.length - shown)} more
                </Button>
              </div>
            )
          ) : (<>
          {/* Pinned bar (no bottom menu on this page): more topics, and a way back. */}
          <div className="h-40" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-center gap-2 border-t border-border bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-sheet">
            <p className="text-sm text-muted-foreground" data-testid="topic-count">
              Showing {Math.min(shown, topics.length)} of {topics.length} topics
            </p>
            {topics.length > shown && (
              <Button type="button" className="min-h-11 bg-blue-500 text-white hover:bg-blue-700" onClick={() => setShown((n) => n + step)}>
                Show {Math.min(step, topics.length - shown)} more
              </Button>
            )}
            {/* Same Back as every other focus page. */}
            <button type="button" onClick={goBack} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </button>
          </div>
          </>)}
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
  guest,
  onRate,
  returnTo,
  linksInNewTab,
  stacked,
}: {
  topic: OpenTopic;
  shownRating: number | null;
  canVote: boolean;
  guest: boolean;
  onRate: (topicId: string, rating: number | null) => Promise<boolean>;
  returnTo: string;
  linksInNewTab: boolean;
  stacked: boolean;
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
      <div className={cn(stacked ? ROW_STACKED : ROW_GRID, 'px-1 py-2', !stacked && 'sm:px-4')}>
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
          {hasDetails && <span className={stacked ? undefined : 'sm:hidden'}>{detailsButton}</span>}
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
          {hasDetails && !stacked && <span className="ml-auto hidden sm:inline-flex">{detailsButton}</span>}
          {guest && shownRating !== null && (
            <p className="basis-full text-xs text-muted-foreground" data-testid="guest-save">
              <Link to={signUpHref(returnTo)} className="text-blue-600 hover:text-blue-700">
                Sign up
              </Link>
              {' or '}
              <Link to={signInHref(returnTo)} className="text-blue-600 hover:text-blue-700">
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
        <div className={cn('px-1 pb-3', !stacked && 'sm:px-4')} data-testid="topic-details">
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
                    <Link to={`/p/${topic.author.slug}`} {...(linksInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="font-medium text-foreground hover:underline">
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

function AddYourOwn({ onAdded, returnTo, quiet }: { onAdded: () => Promise<void>; returnTo: string; quiet: boolean }) {
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
      {/* Embedded, outline: the host page's Register stays the one filled action (P955). */}
      <Button
        type="button"
        variant={quiet ? 'outline' : 'default'}
        className={cn('min-h-11 self-start', !quiet && 'bg-blue-500 text-white hover:bg-blue-700')}
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1 h-4 w-4" aria-hidden /> Add a topic
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a topic</DialogTitle>
        </DialogHeader>
        {!user ? (
          <p className="text-base text-foreground">
            <Link to={signInHref(returnTo)} className="font-medium text-blue-700 underline underline-offset-2">
              Sign in
            </Link>{' '}
            to add a topic.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3" data-testid="add-topic-form">
            <label htmlFor="new-topic" className="sr-only">
              Your topic
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
              placeholder="Your topic"
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base"
            />
            <textarea
              value={extra}
              onChange={(e) => {
                setExtra(e.target.value);
                if (status === 'long') setStatus('idle');
              }}
              maxLength={1000}
              rows={3}
              placeholder="Comment or YouTube link (optional)"
              aria-label="Comment or YouTube link (optional)"
              className="w-full rounded-lg border border-border bg-background p-3 text-base"
            />
            <label className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="h-4 w-4 accent-blue-600" />
              Add anonymously
            </label>
            {status === 'empty' && <p className="text-sm text-red-600">Write a topic first.</p>}
            {status === 'long' && <p className="text-sm text-red-600">Keep the comment under 240 characters.</p>}
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
