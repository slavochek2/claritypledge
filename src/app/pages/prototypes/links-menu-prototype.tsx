/**
 * @file links-menu-prototype.tsx
 * @description DEV-only prototype (/tree/links-menu). The approved reference for the Links
 * menu redesign and the session-bar unification. Three sections:
 *
 *   1. THE MENU. Shape C (segmented, no drill-in) is the founder's choice, with the groups
 *      renamed Points / Letters / Tools — "Instruments" sat next to "Tools" and nobody could
 *      tell which held what. B is kept as the runner-up so the choice stays checkable.
 *   2. THE "THIS EVENT" GROUP. Toggle it. OFF is the real default: of the 14 events readable
 *      on prod with the anon key, ZERO have a `links` value, so this group has never rendered
 *      an entry in production. The group is kept (it costs nothing unset) but nothing is
 *      designed around it.
 *   3. THE SESSION LINE + the End Session treatment. /live's banner and /transcribe's header
 *      already agree (neutral at rest, destructive on hover); the shared SessionBar is the
 *      only one red at rest. Section 3 shows both, side by side, and the bar hidden on the
 *      page it points at.
 *
 * Nothing here is wired to real data or real navigation — it is a render-only comparison
 * surface. The real implementations live in event-links-menu.tsx / event-links.ts and
 * session-bar.tsx / room-capture-bar.tsx / transcribe-room-page.tsx.
 *
 * DESIGN SYSTEM: entries reuse ANSWER_BUTTON_CLASS (meeting-terms-page.tsx); the bar mock
 * reuses SessionBar's own classes and the "neutral" end control reuses the class string
 * live-session-banner.tsx:80 and transcribe-room-page.tsx:326 already share — so what is
 * approved here is what ships. This file introduces no colour of its own.
 */
import { useState } from 'react';
import { ChevronRight, ExternalLink, LogOut } from 'lucide-react';
import { ANSWER_BUTTON_CLASS } from '@/app/pages/meeting-terms-page';
import { cn } from '@/lib/utils';

type Variant = 'current' | 'c' | 'b';

/**
 * A per-event extras example. Default OFF on the page — see the file header: no prod event
 * has ever carried one. Shown only to prove the group still works when it is set.
 */
const EVENT_EXTRAS = ['tonight'];

/**
 * The standing point collections. `aisafety1` is the sixth, added as one more literal in
 * event-links.ts — verified on PROD 2026-09-16, it carries 4 points and 8 stories, and it lives in
 * the user `tags` column (isSystemTag returns false for it), so the stake surface's existing branch
 * already queries the right column and it needs no third code path.
 *
 * Moving this list — and the nine letters — out of source into founder-editable data was SPLIT OUT
 * of P1323 (founder, 2026-09-16) so the spec stays reversible. See docs/process-learnings.md
 * INBOX-78; that work must own its write path, not just its storage.
 *
 * NOT auto-derived from "tags the founder created", there or here: there is no tags table and no
 * tag author. A tag is a string a DB trigger extracts from any `#hashtag` in content
 * (20260327084215_auto_extract_story_hashtags.sql), so "my tags" would resolve to every
 * incidental hashtag ever written. Curated and explicit.
 *
 * Labels ARE the tags, per the founder decision behind STANDARD_STAKE_TAGS ("if I say go to
 * the menu and select cmp7", the spoken word and the rendered label match). `aisafety1` is
 * the first one where that reads awkwardly.
 * [FOUNDER DECISION: does a curated entry get an optional display label, or stay tag-only?]
 */
const POINTS = ['cmp7', 'cmp3', 'cmp10', 'understanding', 'misunderstanding', 'aisafety1'];

/** Today's three tools (event-links.ts STANDARD_TOOL_ENTRIES). */
const TOOLS = [
  { label: 'Transcribe', newTab: false },
  { label: 'Start a Clarity Session', newTab: false },
  { label: 'Slides', newTab: true },
];

/**
 * The nine public letters. Verified on PROD 2026-09-16: resolve_letter_shortcode returns a
 * sealed one-to-many letter for st1..st9 and null for st10 — there are exactly nine.
 *
 * [FOUNDER DECISION: copy — PLACEHOLDER, NOT APPROVED] Written from each letter's own point
 * statements so the shape can be judged at real label lengths. `st1`..`st9` are internal
 * taxonomy (decisions.md: do not surface them as primary labels outward), which is why each
 * row leads with a phrase and carries the code as a quiet suffix.
 */
const LETTERS = [
  { code: 'st1', label: 'Three kinds of understanding' },
  { code: 'st2', label: 'Explain it back' },
  { code: 'st3', label: 'Shared belief vs common belief' },
  { code: 'st4', label: 'Explain back without judgment' },
  { code: 'st5', label: 'You cannot grade your own understanding' },
  { code: 'st6', label: 'Agreement is not understanding' },
  { code: 'st7', label: 'Knowing that they know' },
  { code: 'st8', label: 'Putting it in writing' },
  { code: 'st9', label: 'A public signal' },
];

const ROW = cn(ANSWER_BUTTON_CLASS, 'w-full rounded-md px-4 text-left flex items-center justify-between gap-2');

/** The treatment /live's banner and /transcribe's header already share. */
const NEUTRAL_END_CLASS =
  'flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-lg px-3 h-8 transition-colors';

function GroupHeading({ children }: { children: React.ReactNode }) {
  return <p className="pt-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground">{children}</p>;
}

function Row({ label, hint, trailing }: { label: string; hint?: string; trailing?: React.ReactNode }) {
  return (
    <button type="button" className={ROW}>
      <span className="truncate">
        {label}
        {hint && <span className="ml-2 text-xs font-normal opacity-60">{hint}</span>}
      </span>
      {trailing}
    </button>
  );
}

/**
 * The entry list. `withEvent` drives the pinned group — when it is off, the heading and its
 * separator must not render at all, which is the state every prod event is in today.
 */
function MenuBody({ variant, withEvent }: { variant: Variant; withEvent: boolean }) {
  const [tab, setTab] = useState<'points' | 'letters' | 'tools'>('points');
  const [level, setLevel] = useState<'root' | 'points' | 'letters'>('root');

  const eventGroup = withEvent ? (
    <>
      <GroupHeading>This event</GroupHeading>
      {EVENT_EXTRAS.map((t) => <Row key={t} label={t} />)}
      <hr className="my-2 border-border" />
    </>
  ) : null;

  const toolRows = TOOLS.map((t) => (
    <Row key={t.label} label={t.label} trailing={t.newTab ? <ExternalLink className="h-3.5 w-3.5 opacity-50" /> : undefined} />
  ));
  const letterRows = LETTERS.map((l) => <Row key={l.code} label={l.label} hint={l.code} />);
  const pointRows = POINTS.map((t) => <Row key={t} label={t} />);

  if (level !== 'root') {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setLevel('root')}
          className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ‹ Back
        </button>
        <GroupHeading>{level === 'points' ? 'Points' : 'Letters'}</GroupHeading>
        {level === 'points' ? pointRows : letterRows}
      </div>
    );
  }

  // Today's shipped shape: one flat list, no letters at all.
  if (variant === 'current') {
    return (
      <div className="flex flex-col gap-2">
        {eventGroup}
        {POINTS.slice(0, 5).map((t) => <Row key={t} label={t} />)}
        <hr className="my-2 border-border" />
        {toolRows}
      </div>
    );
  }

  // Runner-up: two drill-ins, kept so the choice stays checkable.
  if (variant === 'b') {
    return (
      <div className="flex flex-col gap-2">
        {eventGroup}
        <button type="button" onClick={() => setLevel('points')} className={ROW}>
          <span>Points</span>
          <span className="flex items-center gap-2 text-xs font-normal opacity-60">
            {POINTS.length} <ChevronRight className="h-4 w-4" />
          </span>
        </button>
        <button type="button" onClick={() => setLevel('letters')} className={ROW}>
          <span>Letters</span>
          <span className="flex items-center gap-2 text-xs font-normal opacity-60">
            {LETTERS.length} <ChevronRight className="h-4 w-4" />
          </span>
        </button>
        <hr className="my-2 border-border" />
        {toolRows}
      </div>
    );
  }

  // CHOSEN — C: one panel, three tabs, no back button.
  return (
    <div className="flex flex-col gap-2">
      {eventGroup}
      <div className="mb-1 flex rounded-md border border-border p-0.5" role="tablist">
        {(['points', 'letters', 'tools'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 rounded px-2 py-1.5 text-sm font-medium capitalize transition-colors',
              tab === t ? 'bg-[#002B5C] text-white dark:bg-blue-400 dark:text-slate-900' : 'text-muted-foreground'
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'points' && pointRows}
      {tab === 'letters' && letterRows}
      {tab === 'tools' && toolRows}
    </div>
  );
}

function PhoneFrame({ width, height, variant, withEvent }: { width: number; height: number; variant: Variant; withEvent: boolean }) {
  return (
    <div className="shrink-0">
      <p className="mb-1 text-xs text-muted-foreground">{width}×{height}</p>
      <div className="relative overflow-hidden rounded-xl border-2 border-border bg-muted/30" style={{ width, height }}>
        <div className="absolute inset-x-0 top-0 flex h-12 items-center justify-between border-b border-border bg-background px-3 text-xs">
          <span className="font-semibold">ClarityPledge</span>
          <span className={cn(ANSWER_BUTTON_CLASS, 'rounded-md px-3 py-0 text-xs leading-8')}>Links</span>
        </div>
        <div className="absolute inset-0 bg-black/20" />
        {/* Matches .event-links-sheet: bottom-anchored, capped, scrolls inside. */}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-xl border-t border-border bg-background px-4 pb-4"
          style={{ maxHeight: height - 16 }}
        >
          <p className="shrink-0 pb-2 pt-4 text-base font-semibold">Links</p>
          <div className="overflow-y-auto">
            <MenuBody variant={variant} withEvent={withEvent} />
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopFrame({ variant, withEvent }: { variant: Variant; withEvent: boolean }) {
  return (
    <div className="shrink-0">
      <p className="mb-1 text-xs text-muted-foreground">Desktop dropdown (lg and up)</p>
      <div className="relative h-[560px] w-[420px] overflow-hidden rounded-xl border-2 border-border bg-muted/30">
        <div className="absolute inset-x-0 top-0 flex h-14 items-center justify-end gap-3 border-b border-border bg-background px-4 text-sm">
          <span className={cn(ANSWER_BUTTON_CLASS, 'rounded-md px-3 py-0 text-sm leading-9')}>Links</span>
          <span className="h-8 w-8 rounded-full bg-muted" />
        </div>
        <div className="absolute right-4 top-16 w-72 rounded-md border border-border bg-background p-2 shadow-lg">
          <div className="max-h-[460px] overflow-y-auto">
            <MenuBody variant={variant} withEvent={withEvent} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- session line ---- */

/** SessionBar's own classes, copied verbatim. `endStyle` is the one thing under review. */
function BarMock({ endStyle }: { endStyle: 'red-at-rest' | 'neutral' }) {
  return (
    <div className="relative z-40 border-b border-blue-200 bg-blue-50 px-4 py-2">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <span className="text-sm font-medium text-blue-900">● Transcribing for AI insights</span>
        <div className="flex items-center gap-4">
          <span className="h-8 rounded-md bg-blue-500 px-4 text-sm font-medium leading-8 text-white">Open</span>
          {endStyle === 'red-at-rest' ? (
            <span className="h-8 whitespace-nowrap px-3 text-sm leading-8 text-destructive">End session</span>
          ) : (
            <button type="button" className={NEUTRAL_END_CLASS}>
              <LogOut className="h-4 w-4" />
              End session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RoomHeaderMock() {
  return (
    <div className="flex h-14 items-center justify-between border-b border-border bg-background px-4">
      <span className="text-sm font-semibold">ClarityPledge</span>
      <button type="button" className={NEUTRAL_END_CLASS}>
        <LogOut className="h-4 w-4" />
        End Session
      </button>
    </div>
  );
}

function RoomBodyMock() {
  return (
    <div className="px-4 py-3">
      <p className="mb-2 text-sm text-muted-foreground">← Back</p>
      <p className="mb-1 text-xs text-muted-foreground">1 in the room: Vyacheslav Ladischenski</p>
      <p className="mb-3 text-xs text-muted-foreground">● Listening — your words appear here a few seconds after you say them</p>
      <p className="text-sm"><span className="font-semibold">Vyacheslav Ladischenski</span> <span className="text-xs text-muted-foreground">12:24 PM</span></p>
      <p className="text-sm text-muted-foreground">We don't have it. And yeah, and also in slash understanding…</p>
    </div>
  );
}

export function LinksMenuPrototype() {
  const [variant, setVariant] = useState<Variant>('c');
  const [narrow, setNarrow] = useState(false);
  const [withEvent, setWithEvent] = useState(false);

  const VARIANTS: Array<{ id: Variant; name: string; note: string }> = [
    {
      id: 'c',
      name: 'C — segmented (chosen)',
      note: 'One panel, three tabs, no back button. Points · Letters · Tools — plain nouns that do not compete with each other the way "Instruments" and "Tools" did. Every destination is two taps and the second never leaves the panel. The panel height stops depending on how many collections exist, so a new tag changes nothing but the Points tab.',
    },
    {
      id: 'b',
      name: 'B — two drill-ins (runner-up)',
      note: 'Kept so the choice stays checkable. Same content, reached by drilling in and backing out instead of switching tabs. Costs a back button and a sense of place; buys a top level that names its two groups with counts.',
    },
    {
      id: 'current',
      name: 'Current (ships today)',
      note: 'Today, for reference: one flat list, five point collections, no letters, no aisafety1, and reachable only where a room is running.',
    },
  ];

  const active = VARIANTS.find((v) => v.id === variant) ?? VARIANTS[0];

  return (
    <div className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold">Links menu + session line — approved reference</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Settled: shape C, groups named Points / Letters / Tools, the menu on every product surface
          rather than only where a room runs, the nine letters inside the Letters tab, and the
          session line hidden on the page it points at. Open: the letters' labels, which are
          placeholders.
        </p>

        {/* ------------------------------------------------------------- section 1 */}
        <h2 className="mt-10 text-lg font-semibold">1. The menu</h2>

        <div className="mt-3 flex flex-wrap gap-2">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVariant(v.id)}
              className={cn(
                'rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors',
                variant === v.id
                  ? 'border-[#002B5C] bg-[#002B5C] text-white dark:border-blue-400 dark:bg-blue-400 dark:text-slate-900'
                  : 'border-border text-muted-foreground hover:border-[#002B5C]'
              )}
            >
              {v.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setNarrow((n) => !n)}
            className="rounded-md border-2 border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
          >
            {narrow ? 'Show 375px' : 'Show 320px'}
          </button>
          <button
            type="button"
            onClick={() => setWithEvent((e) => !e)}
            className="rounded-md border-2 border-dashed border-border px-3 py-2 text-sm text-muted-foreground"
          >
            {withEvent ? 'Hide “This event” (the real default)' : 'Simulate an event that has links'}
          </button>
        </div>

        <p className="mt-3 max-w-3xl text-sm">{active.note}</p>
        {!withEvent && (
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            “This event” is off, which is what every event on prod looks like — 14 events readable
            with the anon key, none with a links value. The heading and its separator must not
            render at all in this state.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-start gap-8">
          {narrow
            ? <PhoneFrame width={320} height={568} variant={variant} withEvent={withEvent} />
            : <PhoneFrame width={375} height={667} variant={variant} withEvent={withEvent} />}
          <DesktopFrame variant={variant} withEvent={withEvent} />
        </div>

        {/* ------------------------------------------------------------- section 2 */}
        <h2 className="mt-12 text-lg font-semibold">2. End Session — one treatment, three places</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          /live's banner and /transcribe's header already share a treatment: neutral at rest,
          destructive on hover. The shared session bar is the only one red at rest — and it is the
          one that persists on every page for the whole session, next to a blue primary. Hover both
          to compare.
        </p>

        <div className="mt-5 flex flex-wrap gap-8">
          <div>
            <p className="mb-1 text-xs font-semibold text-destructive">Today — red at rest (the outlier)</p>
            <div className="w-[420px] overflow-hidden rounded-xl border-2 border-border">
              <BarMock endStyle="red-at-rest" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">Proposed — matches the other two</p>
            <div className="w-[420px] overflow-hidden rounded-xl border-2 border-border">
              <BarMock endStyle="neutral" />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">Unchanged — /live and /transcribe headers</p>
            <div className="w-[420px] overflow-hidden rounded-xl border-2 border-border">
              <RoomHeaderMock />
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------- section 3 */}
        <h2 className="mt-12 text-lg font-semibold">3. The session line on /transcribe/:code</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Left is what ships today: two end-controls, and an “Open” button whose destination is the
          page it is drawn on. Right applies the rule /live already follows — the line is a remote
          control for a session you are not looking at, so on the session's own page it does not
          render. The page still says it is recording, in its own words, one line down.
        </p>

        <div className="mt-5 flex flex-wrap gap-8">
          <div>
            <p className="mb-1 text-xs font-semibold text-destructive">Today — duplicated</p>
            <div className="w-[420px] overflow-hidden rounded-xl border-2 border-border">
              <RoomHeaderMock />
              <BarMock endStyle="red-at-rest" />
              <RoomBodyMock />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">Proposed — line hidden on its own page</p>
            <div className="w-[420px] overflow-hidden rounded-xl border-2 border-border">
              <RoomHeaderMock />
              <RoomBodyMock />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">Unchanged — the line on every other page</p>
            <div className="w-[420px] overflow-hidden rounded-xl border-2 border-border">
              <div className="flex h-14 items-center border-b border-border px-4 text-sm font-semibold">ClarityPledge</div>
              <BarMock endStyle="neutral" />
              <div className="px-4 py-6 text-sm text-muted-foreground">…any other page, e.g. /feed or /stake/cmp7</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
