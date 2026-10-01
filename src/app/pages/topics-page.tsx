/**
 * @file topics-page.tsx
 * @description P1347: /topics — attendees rate upcoming Clarity Night topics.
 *
 * Job: "tell us, in under a minute, which topics you want next." Each card is one
 * open topic with the thinker's video that starts it, played in place. Rating is
 * one tap, 0–5, with no sign-in (one vote per device). Typed suggestions need
 * sign-in and go only to the founder.
 *
 * Results (the current order with rating counts and the next event) appear once
 * this device has rated at least one topic: the order is the reward for voting,
 * and showing it first would anchor the vote.
 *
 * Votes are advisory. Nothing on this page picks the topic.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { SEO } from '@/app/components/seo';
import { useAuth } from '@/auth';
import { StoryVideoPlayer } from '@/app/components/shared/story-video-player';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { getUpcomingEvents } from '@/app/data/api';
import {
  getOpenTopics,
  getVoterToken,
  isValidOptionalLink,
  rankTopics,
  rateTopic,
  suggestTopic,
  type OpenTopic,
} from '@/app/data/topic-voting';
import { cn } from '@/lib/utils';

const RATINGS = [0, 1, 2, 3, 4, 5] as const;

interface NextEvent {
  slug: string;
  datetime: string;
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; topics: OpenTopic[] };

export function TopicsPage() {
  const voterToken = useMemo(() => getVoterToken(), []);
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null);
  // Ratings tapped but not yet confirmed by the server. Laid OVER every fetched list, so a
  // refetch that left before a later tap can never wipe that tap from the screen.
  const [pending, setPending] = useState<Record<string, number>>({});
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const topics = await getOpenTopics(voterToken).catch(() => null);
    if (seq !== loadSeq.current) return; // a newer load is in flight; it wins
    // A failed REFRESH keeps what is on screen; only a failed first load shows the error.
    setState((s) => (topics ? { kind: 'ready', topics } : s.kind === 'ready' ? s : { kind: 'error' }));
  }, [voterToken]);

  useEffect(() => {
    load();
    getUpcomingEvents()
      .then((events) => {
        const now = Date.now();
        const next = events.find((e) => e.status === 'upcoming' && new Date(e.datetime).getTime() > now);
        if (next) setNextEvent({ slug: next.slug, datetime: next.datetime });
      })
      .catch(() => {});
  }, [load]);

  const handleRate = useCallback(
    async (topicId: string, rating: number) => {
      setPending((p) => ({ ...p, [topicId]: rating }));
      const ok = await rateTopic(topicId, voterToken, rating).catch(() => false);
      if (ok) await load();
      // Success: the fetched row now carries it. Failure: the selection rolls back to the
      // last CONFIRMED rating, so a highlighted number always means "saved".
      setPending((p) => {
        if (p[topicId] !== rating) return p; // a later tap on this topic owns the slot
        const { [topicId]: _drop, ...rest } = p;
        return rest;
      });
      return ok;
    },
    [voterToken, load],
  );

  const topics = state.kind === 'ready' ? state.topics : [];
  const hasConfirmedRating = topics.some((t) => t.myRating !== null);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-6 sm:pt-10">
      <SEO
        title="Pick the next topic"
        description="Rate the topics for the next Clarity Night. Each one starts from a short video."
        url="/topics"
      />

      <header className="mb-6">
        <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          Pick the next Clarity Night topic
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Rate at least 3 topics: 0 = not for me, 5 = I really want it. The host decides, using your ratings.
        </p>
      </header>

      {state.kind === 'loading' && <ClarityPageLoader />}

      {state.kind === 'error' && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-base text-foreground">We could not load the topics.</p>
          <Button type="button" variant="outline" className="mt-3 min-h-11" onClick={() => { setState({ kind: 'loading' }); load(); }}>
            Try again
          </Button>
        </div>
      )}

      {state.kind === 'ready' && topics.length === 0 && (
        <p className="rounded-lg border border-border p-4 text-base text-muted-foreground">
          There are no topics to rate yet. You can suggest one below.
        </p>
      )}

      {state.kind === 'ready' && topics.length > 0 && (
        <ul className="flex flex-col gap-6" data-testid="topic-list">
          {topics.map((t) => (
            <li key={t.id}>
              <TopicCard topic={t} shownRating={pending[t.id] ?? t.myRating} onRate={handleRate} />
            </li>
          ))}
        </ul>
      )}

      {state.kind === 'ready' && hasConfirmedRating && <Results topics={topics} nextEvent={nextEvent} />}

      {state.kind === 'ready' && <SuggestNew />}
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function TopicCard({
  topic,
  shownRating,
  onRate,
}: {
  topic: OpenTopic;
  shownRating: number | null;
  onRate: (topicId: string, rating: number) => Promise<boolean>;
}) {
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const rate = async (r: number) => {
    setFailed(false);
    setSaving(true);
    const ok = await onRate(topic.id, r);
    setSaving(false);
    if (!ok) setFailed(true);
  };

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card" data-testid="topic-card">
      {/* The player draws its own click-to-play poster, so one tap plays the video. */}
      <StoryVideoPlayer videoUrl={topic.videoUrl} />

      <div className="p-3 sm:p-4">
        <h2 className="text-lg font-semibold leading-snug text-foreground">{topic.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Video: {topic.thinkerName}</p>
        <p className="mt-2 text-base text-foreground">{topic.why}</p>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-foreground">How much do you want this topic?</legend>
          <div className="grid grid-cols-6 gap-1.5 sm:gap-2" role="radiogroup" aria-label={`Rate: ${topic.title}`}>
            {RATINGS.map((r) => {
              const selected = shownRating === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={r === 0 ? '0, not for me' : r === 5 ? '5, I really want it' : String(r)}
                  onClick={() => rate(r)}
                  className={cn(
                    'min-h-11 rounded-lg border text-base font-semibold',
                    // 0 is a real answer but not a "want": selected 0 is dark grey, not action blue.
                    selected && r === 0 && 'border-slate-700 bg-slate-700 text-white',
                    selected && r > 0 && 'border-blue-600 bg-blue-600 text-white',
                    !selected && 'border-border bg-background text-foreground hover:border-blue-400',
                  )}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>Not for me</span>
            <span>I really want it</span>
          </div>
        </fieldset>

        <div className="mt-2 min-h-5 text-sm" aria-live="polite">
          {saving && <span className="text-muted-foreground">Saving…</span>}
          {!saving && failed && (
            <span className="text-red-600" role="alert">
              Not saved. Tap a number to try again.
            </span>
          )}
          {!saving && !failed && topic.myRating !== null && (
            <span className="flex items-center gap-1 text-green-700">
              <Check className="h-4 w-4" aria-hidden /> Saved ·{' '}
              <a href="#results" className="text-blue-700 underline underline-offset-2">
                see current ratings
              </a>
            </span>
          )}
        </div>

        <ImproveTopic topicId={topic.id} />
      </div>
    </article>
  );
}

// ─── Results ─────────────────────────────────────────────────────────────────

function formatEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function Results({ topics, nextEvent }: { topics: OpenTopic[]; nextEvent: NextEvent | null }) {
  const ranked = rankTopics(topics);
  const leader = ranked[0]?.ratingCount ? ranked[0] : null;

  return (
    <section id="results" className="mt-10 scroll-mt-20" aria-labelledby="results-heading" data-testid="topic-results">
      <h2 id="results-heading" className="text-xl font-semibold text-foreground">
        Current ratings
      </h2>
      {leader && (
        <p className="mt-2 text-base text-foreground">
          Top-rated now: <span className="font-medium">{leader.title}</span>
        </p>
      )}
      {nextEvent && (
        <p className="mt-1 text-base text-foreground">
          Next Clarity Night:{' '}
          <Link to={`/events/${nextEvent.slug}`} className="font-medium text-blue-700 underline underline-offset-2">
            {formatEventDate(nextEvent.datetime)}
          </Link>
        </p>
      )}

      <ol className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border">
        {ranked.map((t, i) => (
          <li key={t.id} className="flex gap-3 p-3">
            <span className="w-5 shrink-0 text-sm font-semibold text-muted-foreground">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-base text-foreground">{t.title}</p>
              <p className="text-sm text-muted-foreground">
                {t.ratingCount === 0
                  ? 'No ratings yet'
                  : `Average ${t.ratingAvg?.toFixed(1)} from ${t.ratingCount} ${t.ratingCount === 1 ? 'rating' : 'ratings'}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-sm text-muted-foreground">One rating per phone. The host makes the final choice.</p>
    </section>
  );
}

// ─── Suggestions (signed-in only, founder-only view) ────────────────────────

const SIGN_IN_HREF = `/login?redirect=${encodeURIComponent('/topics')}`;

function Disclosure({
  label,
  heading,
  children,
}: {
  label: string;
  heading?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const button = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className={cn(
        'flex min-h-11 w-full items-center justify-between gap-2 text-left',
        heading ? 'text-base font-semibold text-foreground' : 'text-sm font-medium text-blue-700',
      )}
    >
      {label}
      <ChevronDown className={cn('h-4 w-4 shrink-0', open && 'rotate-180')} aria-hidden />
    </button>
  );
  return (
    <>
      {heading ? <h2>{button}</h2> : button}
      {open && children}
    </>
  );
}

function ImproveTopic({ topicId }: { topicId: string }) {
  const { user } = useAuth();
  return (
    <div className="mt-3 border-t border-border pt-1">
      <Disclosure label={user ? 'Ideas to make this topic better?' : 'Ideas for this topic? Sign in to send'}>
        <SuggestionForm topicId={topicId} placeholder="A better question, video or speaker…" withLink={false} />
      </Disclosure>
    </div>
  );
}

function SuggestNew() {
  return (
    <section className="mt-10 rounded-xl border border-border px-4 py-1" data-testid="suggest-new">
      <Disclosure label="Suggest a topic or a speaker" heading>
        <div className="pb-3">
          <SuggestionForm topicId={null} placeholder="A topic, or someone whose ideas you want to discuss" withLink />
        </div>
      </Disclosure>
    </section>
  );
}

function SuggestionForm({
  topicId,
  placeholder,
  withLink,
}: {
  topicId: string | null;
  placeholder: string;
  withLink: boolean;
}) {
  const { user, isLoading } = useAuth();
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (isLoading) return null;
  if (!user) {
    return (
      <p className="mb-2 text-sm text-muted-foreground">
        <Link to={SIGN_IN_HREF} className="font-medium text-blue-700 underline underline-offset-2">
          Sign in
        </Link>{' '}
        to send this to the host. Only the host reads it.
      </p>
    );
  }

  if (status === 'sent') {
    return (
      <p className="mb-2 flex items-center gap-1 text-sm text-green-700" aria-live="polite">
        <Check className="h-4 w-4" aria-hidden /> Sent. Thank you!
      </p>
    );
  }

  const linkOk = isValidOptionalLink(link);
  const canSend = body.trim().length > 0 && linkOk && status !== 'sending';

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setStatus('sending');
    const ok = await suggestTopic({ topicId, body: body.trim(), link: withLink ? link : undefined }).catch(() => false);
    setStatus(ok ? 'sent' : 'error');
  };

  return (
    <form onSubmit={send} className="mb-2 flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder={placeholder}
        aria-label="Your suggestion"
        className="w-full rounded-lg border border-border bg-background p-3 text-base"
      />
      {withLink && (
        <>
          <input
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Link to a video or article (optional)"
            aria-label="Link (optional)"
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base"
          />
          {!linkOk && <p className="text-sm text-red-600">Use a full link starting with https://</p>}
        </>
      )}
      {/* The button appears once there is text to send, rather than sitting disabled
          (P955: no dead primary controls). The hint says what unlocks it. */}
      {body.trim().length > 0 ? (
        <Button type="submit" disabled={!canSend} className="min-h-11 self-start">
          {status === 'sending' ? 'Sending…' : 'Send to the host'}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Write something to send it. Only the host reads it.</p>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-600" role="alert">
          Not sent. Try again in a moment.
        </p>
      )}
    </form>
  );
}
