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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { SEO } from '@/app/components/seo';
import { useAuth } from '@/auth';
import { VideoThumbnailCard } from '@/app/components/shared/video-thumbnail-card';
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

  const load = useCallback(async () => {
    const topics = await getOpenTopics(voterToken);
    setState(topics ? { kind: 'ready', topics } : { kind: 'error' });
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
      // Optimistic: the tap shows at once; the refetch brings the room's numbers.
      setState((s) =>
        s.kind === 'ready'
          ? { ...s, topics: s.topics.map((t) => (t.id === topicId ? { ...t, myRating: rating } : t)) }
          : s,
      );
      const ok = await rateTopic(topicId, voterToken, rating);
      if (ok) await load();
      return ok;
    },
    [voterToken, load],
  );

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-6 sm:pt-10">
      <SEO
        title="Pick the next topic"
        description="Rate the topics for the next Clarity Night. Each one starts from a short video."
        url="/topics"
      />

      <header className="mb-6">
        <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">
          What should we talk about next?
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Rate each topic from 0 to 5. The host picks the topic, and your ratings help.
        </p>
      </header>

      {state.kind === 'loading' && <ClarityPageLoader />}

      {state.kind === 'error' && (
        <p className="rounded-lg border border-border p-4 text-base text-muted-foreground">
          The topics didn't load. Check your connection and refresh the page.
        </p>
      )}

      {state.kind === 'ready' && state.topics.length === 0 && (
        <p className="rounded-lg border border-border p-4 text-base text-muted-foreground">
          No topics are open for rating right now. Check back before the next Clarity Night.
        </p>
      )}

      {state.kind === 'ready' && state.topics.length > 0 && (
        <>
          <ul className="flex flex-col gap-6" data-testid="topic-list">
            {state.topics.map((t) => (
              <li key={t.id}>
                <TopicCard topic={t} onRate={handleRate} />
              </li>
            ))}
          </ul>

          {state.topics.some((t) => t.myRating !== null) && (
            <Results topics={state.topics} nextEvent={nextEvent} />
          )}

          <SuggestNew />
        </>
      )}
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

function TopicCard({
  topic,
  onRate,
}: {
  topic: OpenTopic;
  onRate: (topicId: string, rating: number) => Promise<boolean>;
}) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  const rate = async (r: number) => {
    setFailed(false);
    const ok = await onRate(topic.id, r);
    if (!ok) setFailed(true);
  };

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card" data-testid="topic-card">
      <div className="bg-black">
        {playing ? (
          <StoryVideoPlayer videoUrl={topic.videoUrl} />
        ) : (
          <VideoThumbnailCard
            videoUrl={topic.videoUrl}
            onActivate={() => setPlaying(true)}
            alt={`Video: ${topic.thinkerName}`}
            className="rounded-none"
          />
        )}
      </div>

      <div className="p-4">
        <h2 className="text-lg font-semibold leading-snug text-foreground">{topic.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Starts from {topic.thinkerName}</p>
        <p className="mt-2 text-base text-foreground">{topic.why}</p>

        <fieldset className="mt-4">
          <legend className="mb-2 text-sm font-medium text-foreground">How much do you want this one?</legend>
          <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label={`Rate: ${topic.title}`}>
            {RATINGS.map((r) => {
              const selected = topic.myRating === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={r === 0 ? '0, not for me' : r === 5 ? '5, really want it' : String(r)}
                  onClick={() => rate(r)}
                  className={cn(
                    'min-h-11 rounded-lg border text-base font-semibold transition-colors',
                    selected
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-border bg-background text-foreground hover:border-blue-400',
                  )}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>Not for me</span>
            <span>Really want it</span>
          </div>
        </fieldset>

        {topic.myRating !== null && !failed && (
          <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground" aria-live="polite">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </p>
        )}
        {failed && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            That didn't save. Try again.
          </p>
        )}

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
    <section className="mt-10" aria-labelledby="results-heading" data-testid="topic-results">
      <h2 id="results-heading" className="text-xl font-semibold text-foreground">
        What the room wants so far
      </h2>

      {nextEvent && (
        <p className="mt-2 text-base text-foreground">
          Next Clarity Night:{' '}
          <Link to={`/events/${nextEvent.slug}`} className="font-medium text-blue-700 underline underline-offset-2">
            {formatEventDate(nextEvent.datetime)}
          </Link>
          {leader && (
            <>
              . Leading now: <span className="font-medium">{leader.title}</span>
            </>
          )}
        </p>
      )}

      <ol className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border">
        {ranked.map((t, i) => (
          <li key={t.id} className="flex items-baseline gap-3 p-3">
            <span className="w-5 shrink-0 text-sm font-semibold text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 text-base text-foreground">{t.title}</span>
            <span className="shrink-0 text-right text-sm text-muted-foreground">
              {t.ratingCount === 0 ? (
                'No ratings yet'
              ) : (
                <>
                  <span className="font-semibold text-foreground">{t.ratingAvg?.toFixed(1)}</span> ·{' '}
                  {t.ratingCount} {t.ratingCount === 1 ? 'rating' : 'ratings'}
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">One rating per phone or computer. The host makes the final pick.</p>
    </section>
  );
}

// ─── Suggestions (signed-in only, founder-only view) ────────────────────────

function useSignInHref(): string {
  return `/login?redirect=${encodeURIComponent('/topics')}`;
}

function ImproveTopic({ topicId }: { topicId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center justify-between text-left text-sm font-medium text-blue-700"
      >
        How would this be more interesting?
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <SuggestionForm topicId={topicId} placeholder="A sharper question, a better video, a second voice…" withLink={false} />}
    </div>
  );
}

function SuggestNew() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-10 rounded-xl border border-border p-4" aria-labelledby="suggest-heading">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center justify-between text-left"
      >
        <h2 id="suggest-heading" className="text-base font-semibold text-foreground">
          Suggest a topic or a thinker you admire
        </h2>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && <SuggestionForm topicId={null} placeholder="What should we talk about, or who should start it?" withLink />}
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
  const signInHref = useSignInHref();
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  if (isLoading) return null;
  if (!user) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        <Link to={signInHref} className="font-medium text-blue-700 underline underline-offset-2">
          Sign in
        </Link>{' '}
        to send a suggestion. Only the host reads them.
      </p>
    );
  }

  if (status === 'sent') {
    return (
      <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground" aria-live="polite">
        <Check className="h-4 w-4" aria-hidden /> Thanks. The host will read it.
      </p>
    );
  }

  const linkOk = isValidOptionalLink(link);
  const canSend = body.trim().length > 0 && linkOk && status !== 'sending';

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setStatus('sending');
    const ok = await suggestTopic({ topicId, body: body.trim(), link: withLink ? link : undefined });
    setStatus(ok ? 'sent' : 'error');
  };

  return (
    <form onSubmit={send} className="mt-2 flex flex-col gap-2">
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
            placeholder="Link (optional), e.g. a YouTube video"
            aria-label="Link (optional)"
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-base"
          />
          {!linkOk && <p className="text-sm text-red-600">Use a full link starting with https://</p>}
        </>
      )}
      <p className="text-xs text-muted-foreground">Only the host reads this.</p>
      {/* Body text is what makes the form meaningful; until there is some, the button is
          absent rather than disabled (P955: no dead primary controls). */}
      {body.trim().length > 0 && (
        <Button type="submit" disabled={!canSend} className="min-h-11 self-start">
          {status === 'sending' ? 'Sending…' : 'Send to the host'}
        </Button>
      )}
      {status === 'error' && (
        <p className="text-sm text-red-600" role="alert">
          That didn't send. Try again in a moment.
        </p>
      )}
    </form>
  );
}
