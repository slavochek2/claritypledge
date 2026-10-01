/**
 * @file admin-topics-page.tsx
 * @description P1347: founder-only /admin/topics — publish topics for voting and read the room.
 *
 * Job: "decide next week's topic." Topics are listed by the score the founder chooses
 * on (mean rating × share who gave 3+), with raters beside every number. Publishing a
 * topic is a toggle, adding one is a form with exactly the four fields allowed out of
 * the private backlog (P1166). Suggestions sit below, newest first.
 *
 * The gate is server-side (every RPC calls assert_admin()). Any load error renders the
 * ordinary not-found page, same as /admin/users (P1381).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth';
import { ClarityPageLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { NotFoundPage } from '@/app/pages/not-found-page';
import { analytics } from '@/lib/mixpanel';
import { safeLinkHref } from '@/app/prototypes/events/location-utils';
import { getThumbnailUrl } from '@/lib/video';
import {
  getAdminTopics,
  getAdminTopicSuggestions,
  saveAdminTopic,
  setAdminTopicPublished,
  type AdminTopic,
  type AdminTopicSuggestion,
} from '@/app/data/topic-voting';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'ready'; topics: AdminTopic[]; suggestions: AdminTopicSuggestion[] };

interface Draft {
  id: string | null;
  title: string;
  why: string;
  videoUrl: string;
  thinkerName: string;
  sortOrder: number;
}

const EMPTY_DRAFT: Draft = { id: null, title: '', why: '', videoUrl: '', thinkerName: '', sortOrder: 0 };

export function AdminTopicsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analytics.stopSessionRecording();
  }, []);

  const load = useCallback(async () => {
    const [topics, suggestions] = await Promise.all([getAdminTopics(), getAdminTopicSuggestions()]);
    setState(topics && suggestions ? { kind: 'ready', topics, suggestions } : { kind: 'denied' });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setState({ kind: 'denied' });
      return;
    }
    load();
  }, [authLoading, user, load]);

  if (state.kind === 'loading') return <ClarityPageLoader />;
  if (state.kind === 'denied') return <NotFoundPage />;

  const togglePublished = async (t: AdminTopic) => {
    setError(null);
    if (!(await setAdminTopicPublished(t.id, !t.isPublished))) setError('Could not change publish state.');
    await load();
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError(null);
    if (draft.videoUrl.trim() && !getThumbnailUrl(draft.videoUrl)) {
      setError('Video link must be a YouTube link starting with https://');
      return;
    }
    const id = await saveAdminTopic(draft);
    if (!id) {
      setError('Could not save. Check every field is filled and short enough.');
      return;
    }
    setDraft(null);
    await load();
  };

  const published = state.topics.filter((t) => t.isPublished).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6">
      <h1 className="text-2xl font-semibold text-foreground">Topics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {published} open for rating · score = average × share who gave 3+ ·{' '}
        <Link to="/topics" className="text-blue-700 underline underline-offset-2">
          see the public page
        </Link>
      </p>

      {error && (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4">
        {draft ? (
          <TopicForm draft={draft} onChange={setDraft} onSubmit={save} onCancel={() => setDraft(null)} />
        ) : (
          <Button type="button" className="min-h-11" onClick={() => setDraft(EMPTY_DRAFT)}>
            Add a topic
          </Button>
        )}
      </div>

      <ul className="mt-6 flex flex-col divide-y divide-border rounded-xl border border-border" data-testid="admin-topic-list">
        {state.topics.length === 0 && <li className="p-4 text-sm text-muted-foreground">No topics yet.</li>}
        {state.topics.map((t) => (
          <li key={t.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{t.title}</p>
              <p className="text-sm text-muted-foreground">
                {t.source === 'community' ? `Added by ${t.authorName ?? 'an attendee'}` : 'Host topic'}
                {t.thinkerName && ` · ${t.thinkerName}`}
                {t.why && ` · ${t.why}`}
              </p>
              <p className="mt-1 text-sm text-foreground">
                {t.ratingCount === 0
                  ? 'No ratings yet'
                  : `Score ${t.score.toFixed(2)} · avg ${t.ratingAvg?.toFixed(1)} · ${Math.round((t.keenShare ?? 0) * 100)}% gave 3+ · ${t.ratingCount} ${t.ratingCount === 1 ? 'device' : 'devices'}`}
                {t.suggestionCount > 0 && ` · ${t.suggestionCount} suggestions`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-10"
                onClick={() =>
                  setDraft({ id: t.id, title: t.title, why: t.why ?? '', videoUrl: t.videoUrl ?? '', thinkerName: t.thinkerName ?? '', sortOrder: t.sortOrder })
                }
              >
                Edit
              </Button>
              <Button
                type="button"
                variant={t.isPublished ? 'outline' : 'default'}
                className="min-h-10"
                onClick={() => togglePublished(t)}
              >
                {t.isPublished ? 'Unpublish' : 'Publish'}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-foreground">Suggestions</h2>
      <ul className="mt-3 flex flex-col divide-y divide-border rounded-xl border border-border">
        {state.suggestions.length === 0 && <li className="p-4 text-sm text-muted-foreground">No suggestions yet.</li>}
        {state.suggestions.map((s) => {
          const href = s.link ? safeLinkHref(s.link) : undefined;
          return (
            <li key={s.id} className="p-4">
              <p className="text-xs text-muted-foreground">
                {s.topicTitle ? `On “${s.topicTitle}”` : 'New topic or thinker'} ·{' '}
                {s.authorSlug ? (
                  <Link to={`/p/${s.authorSlug}`} className="underline underline-offset-2">
                    {s.authorName ?? s.authorSlug}
                  </Link>
                ) : (
                  s.authorName ?? 'Unknown'
                )}
                {s.email && ` · ${s.email}`} · {new Date(s.createdAt).toLocaleDateString()}
              </p>
              {/* User text rendered as text, never HTML. */}
              <p className="mt-1 whitespace-pre-wrap text-base text-foreground">{s.body}</p>
              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 block break-all text-sm text-blue-700 underline">
                  {s.link}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TopicForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const field = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-base';
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">
        Only the topic title is shown on /topics. The other fields are for you (optional).
      </p>
      <label className="text-sm font-medium">
        Topic
        <input className={field} maxLength={140} required value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} />
      </label>
      <label className="text-sm font-medium">
        Why it's contested (one line) (optional)
        <input className={field} maxLength={240} value={draft.why} onChange={(e) => onChange({ ...draft, why: e.target.value })} />
      </label>
      <label className="text-sm font-medium">
        Thinker (optional)
        <input className={field} maxLength={80} value={draft.thinkerName} onChange={(e) => onChange({ ...draft, thinkerName: e.target.value })} />
      </label>
      <label className="text-sm font-medium">
        Video link (YouTube) (optional)
        <input className={field} type="url" maxLength={500} value={draft.videoUrl} onChange={(e) => onChange({ ...draft, videoUrl: e.target.value })} />
      </label>
      <label className="text-sm font-medium">
        Order on the page (lower first)
        <input
          className={field}
          type="number"
          value={draft.sortOrder}
          onChange={(e) => onChange({ ...draft, sortOrder: Number(e.target.value) || 0 })}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" className="min-h-11">
          {draft.id ? 'Save' : 'Add'}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
