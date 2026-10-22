/**
 * P1545 Phase 1 round 2, Variant B2: "Card grid". Left sidebar (desktop) / bottom tabs (phone).
 * Each card: type + visibility on top, a title that opens the item, facts, ONE fixed visible button pinned to the
 * bottom, and a "..." menu for the rest. Equal-height cards per row.
 */
import { useState } from 'react';
import type { LabState } from './ArtifactsLab';
import { SHARED, SHARE_MESSAGES, YOURS, type MockArtifact } from './mock';
import {
  Disclosure,
  DraftChip,
  EmptyLine,
  EventsPage,
  MetaLine,
  MoreMenu,
  OpenTitle,
  PageHeader,
  PrimaryButton,
  RecipientRows,
  Shell,
  Tabs,
  TypeDisc,
  TypeLabel,
  UnreadDot,
  VisibilityIcon,
} from './shared';
import { actionsFor, isInChat, recipientsLabel } from './model';

type Tab = 'yours' | 'shared';
const CHAT_TITLES = SHARE_MESSAGES.map(m => m.title);

function ArtifactCard({ a }: { a: MockArtifact }) {
  const set = actionsFor(a);
  const hasRecipients = !a.draft && !a.sharedBy && a.kind === 'letter';
  return (
    <li className="relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-2 px-4 pt-4">
        <div className="flex items-center gap-2">
          <TypeDisc kind={a.kind} />
          <TypeLabel kind={a.kind} />
          {a.draft && <DraftChip />}
          <span className="ml-auto flex items-center gap-2">
            {a.unread && <UnreadDot />}
            {!a.sharedBy && <VisibilityIcon v={a.visibility} />}
          </span>
        </div>
        <OpenTitle a={a} stretch />
        <MetaLine a={a} inChat={isInChat(a, CHAT_TITLES)} />
        {a.newFrom && (
          <p className="text-sm font-medium text-blue-600">
            {'•'} {a.newFrom.count} new from {a.newFrom.name}
          </p>
        )}
      </div>
      {hasRecipients && (
        <div className="relative z-10 mt-2">
          <Disclosure label={recipientsLabel(a)}>
            <RecipientRows recipients={a.recipients ?? []} responses={a.responses} />
          </Disclosure>
        </div>
      )}
      <div className="relative z-10 flex items-center gap-1 px-4 py-3">
        <PrimaryButton label={set.primary} />
        <span className="ml-auto">
          <MoreMenu a={a} set={set} />
        </span>
      </div>
    </li>
  );
}

function ArtifactsPage({ state }: { state: LabState }) {
  const [tab, setTab] = useState<Tab>(state === 'empty-shared' || state === 'shared' ? 'shared' : 'yours');
  const [searchOpen, setSearchOpen] = useState(state === 'search-open');
  const [query, setQuery] = useState(state === 'search-open' ? 'hike' : '');

  const yours = state === 'empty-yours' ? [] : YOURS;
  const shared = state === 'empty-shared' ? [] : SHARED;
  const q = query.trim().toLowerCase();
  const items = q
    ? [...yours, ...shared].filter(a => a.title.toLowerCase().includes(q) || (a.sharedBy ?? '').toLowerCase().includes(q))
    : tab === 'yours'
      ? yours
      : shared;
  const unreadShared = shared.filter(a => a.unread).length;

  const closeSearch = () => {
    setSearchOpen(false);
    setQuery('');
  };

  return (
    <Shell active="Artifacts">
      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-28 pt-5 lg:px-6 lg:pb-12 lg:pt-8">
        <PageHeader
          searchOpen={searchOpen}
          query={query}
          onOpenSearch={() => setSearchOpen(true)}
          onQuery={setQuery}
          onCloseSearch={closeSearch}
          menuOpen={state === 'menu-open'}
        />
        {!q && (
          <div className="mt-3">
            <Tabs tab={tab} onTab={setTab} unread={unreadShared} />
          </div>
        )}
        <div className="mt-5">
          {items.length === 0 ? (
            <EmptyLine query={query.trim()} tab={tab} />
          ) : (
            <ul className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2 xl:grid-cols-3">
              {items.map(a => (
                <ArtifactCard key={a.id} a={a} />
              ))}
            </ul>
          )}
        </div>
      </main>
    </Shell>
  );
}

export function VariantB2({ state }: { state: LabState }) {
  if (state === 'events-empty') return <EventsPage empty />;
  if (state === 'events-some') return <EventsPage empty={false} />;
  return <ArtifactsPage key={state} state={state} />;
}
