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
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronRight, Pin } from 'lucide-react';
import { useAuth } from '@/auth';
import { getProfileBySlug } from '@/app/data/api';
import { getPositionsFor, getSharedTags, getTagStatements } from '@/app/data/compare-service';
import { ROUNDS_POLL_MS, getRoundTopic, setRoundTopic } from '@/app/data/event-rounds-service';
import { SEO } from '@/app/components/seo';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { buildCompareRows, type CompareRow, type PositionKey } from '@/lib/compare-positions';
import { cn } from '@/lib/utils';
import type { Profile } from '@/app/types';

// Wording of letter-reveal-ordinal.tsx — third person, because the column describes someone.
const POSITION_FULL_LABELS: Record<PositionKey, string> = {
  strongly_agree: 'Strongly agrees',
  agree: 'Agrees',
  somewhat_agree: 'Somewhat agrees',
  unsure: 'Unsure',
  somewhat_disagree: 'Somewhat disagrees',
  disagree: 'Disagrees',
  strongly_disagree: 'Strongly disagrees',
};

// First person for the viewer's own column — "You strongly agrees" reads wrong.
const POSITION_FIRST_PERSON: Record<PositionKey, string> = {
  strongly_agree: 'Strongly agree',
  agree: 'Agree',
  somewhat_agree: 'Somewhat agree',
  unsure: 'Unsure',
  somewhat_disagree: 'Somewhat disagree',
  disagree: 'Disagree',
  strongly_disagree: 'Strongly disagree',
};

interface Person {
  name: string;
  photoUrl?: string;
  avatarColor?: string;
  hasPledged: boolean;
}

function toPerson(profile: Profile, name = profile.name): Person {
  return {
    name,
    photoUrl: profile.avatarUrl ?? undefined,
    avatarColor: profile.avatarColor,
    hasPledged: profile.hasPledged ?? false,
  };
}

/** letter-reveal-ordinal.tsx StanceColumn — avatar + name above, blue stance pill as the hero. */
function StanceColumn({ person, label }: { person: Person; label: string }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col items-center gap-3">
      <div className="flex items-center gap-1.5 min-w-0 max-w-full">
        <GravatarAvatar
          name={person.name}
          photoUrl={person.photoUrl}
          avatarColor={person.avatarColor}
          isPledger={person.hasPledged}
          size="sm"
          className="!w-6 !h-6 !text-[10px]"
        />
        <span className="text-xs text-[#1A1A1A]/50 truncate">{person.name}</span>
      </div>
      <span className="inline-block max-w-full text-base font-semibold text-blue-700 bg-blue-100 rounded-full px-4 py-2 text-center leading-snug">
        {label}
      </span>
    </div>
  );
}

/**
 * One statement with both positions. The card is a link that opens the point in a new tab;
 * `trailing` sits OUTSIDE the anchor, so a control there never triggers the link.
 */
export function StatementRow({
  row,
  me,
  them,
  trailing,
}: {
  row: CompareRow;
  me: Person;
  them: Person;
  trailing?: ReactNode;
}) {
  return (
    <li className="bg-white rounded-xl border border-border">
      <a
        href={`/point/${row.pointId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {/* letter-point-card.tsx — the statement, pinned, in its own contained card */}
        <div className="rounded-lg border border-border bg-gray-50 p-4">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-600 mt-0.5">
              <Pin size={12} className="rotate-45" />
            </div>
            <p className="text-lg font-medium text-[#1A1A1A] flex-1 min-w-0 break-words leading-snug">
              {row.statement}
            </p>
            <ChevronRight size={18} className="shrink-0 mt-1 text-[#1A1A1A]/30" aria-hidden />
          </div>
        </div>

        <div className="mt-4 flex items-start gap-4">
          <StanceColumn person={me} label={POSITION_FIRST_PERSON[row.mine]} />
          <div className="w-px self-stretch bg-gray-200" />
          <StanceColumn person={them} label={POSITION_FULL_LABELS[row.theirs]} />
        </div>
      </a>
      {trailing && <div className="px-4 pb-4">{trailing}</div>}
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

function TopicMark({ marked, onToggle }: { marked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={marked}
      data-testid="compare-topic-mark"
      className={cn(
        'w-full inline-flex items-center justify-center gap-2 rounded-full border min-h-[40px] px-4 text-sm font-medium',
        marked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-blue-200 text-blue-700',
      )}
    >
      {marked && <Check size={16} />}
      We&rsquo;re talking about this one
    </button>
  );
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
  error: boolean;
}

export function ComparePage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
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
        const tags = person && person.id !== viewerId ? await getSharedTags(viewerId, person.id) : [];
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
        const rows = buildCompareRows(
          statements,
          positions.get(viewerId) ?? new Map(),
          positions.get(person.id) ?? new Map(),
        );
        if (!cancelled) setRowsResult({ key: rowsKey, rows, error: false });
      } catch {
        if (!cancelled) setRowsResult({ key: rowsKey, rows: [], error: true });
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

  let body: ReactNode;
  if (!activeTag) {
    body = <Muted>No statements you both hold a position on yet.</Muted>;
  } else if (!rowsReady) {
    body = <Muted>Loading…</Muted>;
  } else if (rowsReady.error) {
    body = <Muted>Could not load the comparison.</Muted>;
  } else if (rowsReady.rows.length === 0) {
    body = <Muted>Nothing on #{activeTag} you both answered.</Muted>;
  } else {
    body = (
      <ul className="space-y-3">
        {rowsReady.rows.map(row => (
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
    );
  }

  return (
    <Shell>
      <SEO title={`You and ${firstName}`} noIndex />
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

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-lg px-4 py-5">{children}</div>
    </div>
  );
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[#1A1A1A]/60">{children}</p>;
}

export default ComparePage;
