/**
 * @file compare-page.tsx
 * @description P1337: the compare view. Route: /compare/:slug?tag=<tag>
 *
 * The statements the viewer and one other person both hold a position on, largest gap first,
 * agreements last but present. A plain list on purpose: two people share one phone, so no
 * swiping, no modes, nothing hidden. Rows open the point in a NEW tab so the comparison stays
 * on screen. Stance columns reuse the letters vocabulary (letter-reveal-ordinal.tsx): blue on
 * both sides, never green/red.
 *
 * Access: signed-in viewers only. Reached from "Compare with me" on a profile's Points tab.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Pin } from 'lucide-react';
import { useAuth } from '@/auth';
import { getProfileBySlug } from '@/app/data/api';
import { getAnsweredTags, getPositionsFor, getSharedTags, getTagStatements } from '@/app/data/compare-service';
import { ROUNDS_POLL_MS, getRoundTopic, setRoundTopic } from '@/app/data/event-rounds-service';
import { SEO } from '@/app/components/seo';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { StanceColumn, StatementRow, TopicMark, type Person } from '@/app/components/compare/statement-row';

// The row moved to a shared component (also the event room's table card); kept importable here.
export { StatementRow };
import {
  POSITION_FULL_LABELS,
  buildCompareRows,
  type CompareRow,
  type PositionKey,
} from '@/lib/compare-positions';
import { cn } from '@/lib/utils';
import type { Profile } from '@/app/types';

function toPerson(profile: Profile, name = profile.name): Person {
  return {
    name,
    photoUrl: profile.avatarUrl ?? undefined,
    avatarColor: profile.avatarColor,
    hasPledged: profile.hasPledged ?? false,
  };
}

/** A statement only the other person answered: the statement and their position, no "You" column. */
function TheirRow({ pointId, statement, them, position }: { pointId: string; statement: string; them: Person; position: PositionKey }) {
  return (
    <li className="bg-white rounded-xl border border-border">
      <a
        href={`/point/${pointId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <div className="rounded-lg border border-border bg-gray-50 p-4">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 mt-0.5">
              <Pin size={12} className="rotate-45" />
            </div>
            <p className="text-lg font-medium text-[#1A1A1A] flex-1 min-w-0 break-words leading-snug">{statement}</p>
            <ChevronRight size={18} className="shrink-0 mt-1 text-[#1A1A1A]/30" aria-hidden />
          </div>
        </div>
        <div className="mt-4 flex">
          <StanceColumn person={them} label={POSITION_FULL_LABELS[position]} />
        </div>
      </a>
    </li>
  );
}

/**
 * P1337 §3 — opened from a round (`?round=…&table=…`), each row carries "We're talking about
 * this one". Tapping another row moves the mark, tapping the marked row clears it; anyone at
 * the table can tap, last tap wins. A note, not a permission — so a failed write just leaves
 * the previous mark showing.
 */
function useTableTopic(roundId: string | null, table: number | null) {
  const [topic, setTopic] = useState<string | null>(null);
  useEffect(() => {
    if (!roundId || table == null) return;
    let cancelled = false;
    const read = () =>
      getRoundTopic(roundId, table)
        .then(t => { if (!cancelled) setTopic(t); })
        .catch(() => { /* keep */ });
    void read();
    const id = setInterval(read, ROUNDS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [roundId, table]);

  const toggle = (pointId: string) => {
    if (!roundId || table == null) return;
    const next = topic === pointId ? null : pointId;
    const prev = topic;
    setTopic(next);
    setRoundTopic(roundId, table, next).catch(() => setTopic(prev));
  };
  return { topic, toggle, active: !!roundId && table != null };
}

interface BaseResult {
  key: string;
  person: Profile | null;
  tags: { tag: string; count: number }[];
  error: boolean;
}

interface RowsResult {
  key: string;
  rows: CompareRow[];
  /** Statements only the other person answered (with their position), and how many only you did. */
  theirsOnly: { pointId: string; statement: string; position: PositionKey }[];
  mineOnlyCount: number;
  error: boolean;
}

export function ComparePage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  // P1337: opened from the event room, the page carries a way back to it (compare opens in the
  // same tab — founder walkthrough 4). Navigation state, so a shared link shows no Back.
  const backTo = (useLocation().state as { backTo?: string } | null)?.backTo;
  const viewerId = user?.id;
  const tagParam = searchParams.get('tag');
  const tableParam = Number(searchParams.get('table'));
  const tableTopic = useTableTopic(
    searchParams.get('round'),
    Number.isInteger(tableParam) && tableParam > 0 ? tableParam : null,
  );

  // Results carry the key they were fetched for, so a stale result reads as "loading"
  // instead of flashing the previous person's or tag's rows.
  const baseKey = viewerId && slug ? `${viewerId}:${slug}` : null;
  const [base, setBase] = useState<BaseResult | null>(null);

  useEffect(() => {
    if (!baseKey || !viewerId || !slug) return;
    let cancelled = false;
    (async () => {
      try {
        const person = await getProfileBySlug(slug);
        let tags = person && person.id !== viewerId ? await getSharedTags(viewerId, person.id) : [];
        // Nothing shared yet: offer the sets the other person answered, so the page can still show
        // where they stand and invite "Add yours" instead of a dead end.
        if (person && person.id !== viewerId && tags.length === 0) tags = await getAnsweredTags(person.id);
        if (!cancelled) setBase({ key: baseKey, person, tags, error: false });
      } catch {
        if (!cancelled) setBase({ key: baseKey, person: null, tags: [], error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseKey, viewerId, slug]);

  const baseReady = base && base.key === baseKey ? base : null;
  const person = baseReady?.person ?? null;
  const activeTag = tagParam ?? baseReady?.tags[0]?.tag ?? null;

  const rowsKey = person && viewerId && activeTag ? `${viewerId}:${person.id}:${activeTag}` : null;
  const [rowsResult, setRowsResult] = useState<RowsResult | null>(null);

  useEffect(() => {
    if (!rowsKey || !person || !viewerId || !activeTag) return;
    let cancelled = false;
    (async () => {
      try {
        const statements = await getTagStatements(activeTag);
        const positions = await getPositionsFor(
          [viewerId, person.id],
          statements.map(s => s.id),
        );
        const mine = positions.get(viewerId) ?? new Map<string, PositionKey>();
        const theirs = positions.get(person.id) ?? new Map<string, PositionKey>();
        const rows = buildCompareRows(statements, mine, theirs);
        const theirsOnly = statements.flatMap(st => {
          const position = theirs.get(st.id);
          return position && !mine.has(st.id) ? [{ pointId: st.id, statement: st.statement, position }] : [];
        });
        const mineOnlyCount = statements.filter(st => mine.has(st.id) && !theirs.has(st.id)).length;
        if (!cancelled) setRowsResult({ key: rowsKey, rows, theirsOnly, mineOnlyCount, error: false });
      } catch {
        if (!cancelled) setRowsResult({ key: rowsKey, rows: [], theirsOnly: [], mineOnlyCount: 0, error: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rowsKey, person, viewerId, activeTag]);

  const rowsReady = rowsResult && rowsResult.key === rowsKey ? rowsResult : null;

  // The active tag stays in the chip list even when nothing is shared on it (it came from ?tag=).
  const chips = useMemo(() => {
    const tags = baseReady?.tags ?? [];
    if (!activeTag || tags.some(t => t.tag === activeTag)) return tags;
    return [...tags, { tag: activeTag, count: 0 }];
  }, [baseReady, activeTag]);

  const me = useMemo(() => (user ? toPerson(user, 'You') : null), [user]);
  const them = useMemo(() => (person ? toPerson(person) : null), [person]);

  if (authLoading) return <Shell><Muted>Loading…</Muted></Shell>;

  if (!user) {
    const here = `/compare/${slug ?? ''}${tagParam ? `?tag=${encodeURIComponent(tagParam)}` : ''}`;
    return (
      <Shell>
        <Link to={`/login?redirect=${encodeURIComponent(here)}`} className="text-sm font-medium text-blue-700 underline">
          Sign in to compare
        </Link>
      </Shell>
    );
  }

  if (person && person.id === viewerId) return <Navigate to={`/p/${person.slug ?? person.id}`} replace />;

  if (!baseReady) return <Shell><Muted>Loading…</Muted></Shell>;
  if (baseReady.error) return <Shell><Muted>Could not load the comparison.</Muted></Shell>;
  if (!person || !me || !them) return <Shell><Muted>We could not find that person.</Muted></Shell>;

  const firstName = person.name.split(' ')[0];

  // A button, not a small link: it is this page's only way forward when you haven't answered (visual QA).
  const addYours = activeTag && (
    <Link
      to={`/stake/${encodeURIComponent(activeTag)}`}
      className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-600"
      data-testid="compare-add-yours"
    >
      Add yours
    </Link>
  );

  let body: ReactNode;
  if (!activeTag) {
    body = <Muted>{firstName} hasn&rsquo;t answered any statements yet.</Muted>;
  } else if (!rowsReady) {
    body = <Muted>Loading…</Muted>;
  } else if (rowsReady.error) {
    body = <Muted>Could not load the comparison.</Muted>;
  } else {
    const { rows, theirsOnly, mineOnlyCount } = rowsReady;
    body = (
      <div className="space-y-6">
        {rows.length > 0 && (
          <ul className="space-y-3">
            {rows.map(row => (
              <StatementRow
                key={row.pointId}
                row={row}
                me={me}
                them={them}
                trailing={
                  tableTopic.active ? (
                    <TopicMark marked={tableTopic.topic === row.pointId} onToggle={() => tableTopic.toggle(row.pointId)} />
                  ) : undefined
                }
              />
            ))}
          </ul>
        )}
        {theirsOnly.length > 0 && (
          <section data-testid="compare-theirs-only">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[#1A1A1A]">Only {firstName} answered</h2>
              {addYours}
            </div>
            <ul className="space-y-3">
              {theirsOnly.map(r => (
                <TheirRow key={r.pointId} pointId={r.pointId} statement={r.statement} them={them} position={r.position} />
              ))}
            </ul>
          </section>
        )}
        {rows.length === 0 && theirsOnly.length === 0 && (
          mineOnlyCount > 0
            ? <Muted>{firstName} hasn&rsquo;t answered #{activeTag} yet.</Muted>
            : (
              <div className="flex items-center justify-between gap-3">
                <Muted>Nothing on #{activeTag} answered yet.</Muted>
                {addYours}
              </div>
            )
        )}
      </div>
    );
  }

  return (
    <Shell>
      <SEO title={`You and ${firstName}`} noIndex />
      {backTo && <FocusHeader fallback={backTo} />}
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wide text-[#1A1A1A]/50">Where you each stand</p>
        <h1 className="mt-1 text-xl font-semibold text-[#1A1A1A] leading-tight break-words">
          You and {firstName}
        </h1>
      </header>

      {chips.length > 0 && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Statement set">
          {chips.map(({ tag }) => (
            <button
              key={tag}
              type="button"
              aria-pressed={tag === activeTag}
              onClick={() =>
                setSearchParams(
                  prev => {
                    const params = new URLSearchParams(prev);
                    params.set('tag', tag);
                    return params;
                  },
                  { replace: true },
                )
              }
              className={cn(
                'shrink-0 rounded-full px-3 min-h-[40px] text-sm border',
                tag === activeTag
                  ? 'bg-blue-100 border-blue-200 text-blue-700 font-medium'
                  : 'bg-white border-border text-[#1A1A1A]/60',
              )}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {body}
    </Shell>
  );
}

// No min-h-screen: under the layout's fixed header a full-viewport box overflows by the header's
// height, so a one-line empty page scrolled by 80px with nothing below (founder report).
function Shell({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="mx-auto w-full max-w-lg px-4 py-5">{children}</div>
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[#1A1A1A]/60">{children}</p>;
}

export default ComparePage;
