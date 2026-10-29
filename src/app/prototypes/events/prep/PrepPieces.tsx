/**
 * @file PrepPieces.tsx
 * @description P1336 — the page-local compositions the approved prototype (/tree/p1336-d)
 * named: EventBox, SocialProof, the prep status badge and the confirmation PrepBlock. Each is
 * assembled from existing product components (RsvpConfirm's card, AddToCalendarMenu,
 * GroupChatBlock's glyphs and line, EventCard's AttendeeAvatarStack, LetterPrimaryCta)
 * — none of those is copied or restyled here.
 */
import { useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { Calendar, MapPin, MessagesSquare, Video } from 'lucide-react';
import { shareOrCopy } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LetterPrimaryCta } from '@/app/components/letters/letter-primary-cta';
import type { EventWithHost } from '@/app/types';
import type { SocialPerson } from '@/app/data/event-prep-service';
import { AddToCalendarMenu } from '../components/AddToCalendarMenu';
import { AttendeeAvatarStack } from '../components/AttendeeAvatarStack';
import { TELEGRAM_GLYPH, WHATSAPP_GLYPH } from '../components/GroupChatBlock';
import { classifyGroupChat } from '../group-chat-utils';
import { classifyLocation, getLocationDisplayLabel, safeLinkHref } from '../location-utils';
import { formatDate, formatTime } from '../utils';
import { EventShareRow } from '../components/EventShareRow';
import type { Progress } from './prep-plan';
import { isHikeLayout, parseHikeDetails } from '../hike/hike-utils';
import { readEventChatOpenedHint, useGroupChatOpened, type GroupChatSurface } from '../use-group-chat-opened';

export const eventPageUrl = (slug: string) => `${window.location.origin}/events/${slug}`;

/** "Clarity Nights" for that series; any other preparation event reads "our events". */
export const seriesLabel = (event: Pick<EventWithHost, 'title'>) =>
  /clarity night/i.test(event.title) ? 'Clarity Nights' : 'our events';

/** Where the event meets: a hike's "Meet at <point>" (P1403), else the location's display label. */
export function placeLabel(event: EventWithHost): string {
  const location = classifyLocation(event.location);
  const meet = isHikeLayout(event) ? parseHikeDetails(event.hikeDetails)?.meetName : null;
  return meet ? `Meet at ${meet}` : getLocationDisplayLabel(location, event.location);
}

/** RsvpConfirm's event details block. */
export function EventDetails({ event }: { event: EventWithHost }) {
  const start = new Date(event.datetime);
  const end = new Date(start.getTime() + event.durationMinutes * 60 * 1000);
  const location = classifyLocation(event.location);
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-left" data-testid="event-details">
      <h2 className="mb-2 font-semibold">{event.title}</h2>
      <div className="space-y-2 text-sm">
        <div className="flex items-start gap-3">
          <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <p>
            {formatDate(start)}{' '}
            <span className="text-muted-foreground">· {formatTime(start)} - {formatTime(end)}</span>
          </p>
        </div>
        <div className="flex items-start gap-3">
          {location.type === 'virtual'
            ? <Video className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
            : <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />}
          <a href={safeLinkHref(location.href)} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words hover:underline">
            {/* P1403: a hike says where it meets, as the event page does. */}
            {placeLabel(event)}
          </a>
        </div>
      </div>
    </div>
  );
}

export function GroupChatButton({ url }: { url: string }) {
  const href = safeLinkHref(url);
  if (!href) return null;
  const { label, provider } = classifyGroupChat(url);
  const glyph = provider === 'whatsapp' ? WHATSAPP_GLYPH : provider === 'telegram' ? TELEGRAM_GLYPH : null;
  return (
    // One style everywhere (founder 2026-10-23): the outlined button with WhatsApp's green glyph. Where the group chat
    // is the next step (a hike's thank-yous) it says so by ORDER (first, full width), never by a loud filled colour.
    <Button asChild variant="outline" className="h-auto min-h-10 gap-2 whitespace-normal px-2 text-sm">
      <a href={href} target="_blank" rel="noopener noreferrer" data-testid="group-chat-link">
        {glyph ? (
          // WhatsApp's own green on the glyph only (UAT 2026-10-01): recognisable at a glance, while the
          // outlined button never competes with the screen's one primary action.
          <svg viewBox="0 0 24 24" fill="currentColor" className={`h-4 w-4 flex-shrink-0 ${provider === 'whatsapp' ? 'text-[#25D366]' : ''}`} aria-hidden="true">
            <path d={glyph} />
          </svg>
        ) : (
          <MessagesSquare className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        )}
        {label}
      </a>
    </Button>
  );
}

/** The group chat's brand glyph, WhatsApp's own green (the one recognisable mark, never a filled button). */
function ChatGlyph({ url }: { url: string }) {
  const { provider } = classifyGroupChat(url);
  const glyph = provider === 'whatsapp' ? WHATSAPP_GLYPH : provider === 'telegram' ? TELEGRAM_GLYPH : null;
  return glyph ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={`h-4 w-4 flex-shrink-0 ${provider === 'whatsapp' ? 'text-[#25D366]' : ''}`} aria-hidden="true">
      <path d={glyph} />
    </svg>
  ) : (
    <MessagesSquare className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
  );
}

/**
 * P1542 round 6 (decision 43): the group chat as a QUIET text link (glyph + underlined words, text-sm, no border),
 * for the screens whose one action is something else. The tap is recorded (`onOpen`) so the offer can stand down.
 */
export function GroupChatQuietLink({ url, label, onOpen, testId = 'group-chat-link' }: {
  url: string;
  label: string;
  onOpen?: () => void;
  testId?: string;
}) {
  const href = safeLinkHref(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onOpen}
      data-testid={testId}
      className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
    >
      <ChatGlyph url={url} />
      {label}
    </a>
  );
}

/**
 * P1542 round 6c (F): the ONE group-chat offer of the hike flow (registration and feedback thank-yous): the quiet link
 * "WhatsApp group" (the app's own name for the provider, without "Join") and its small caption directly under it.
 * The caption's words differ per place; the look does not.
 */
export function GroupChatOffer({ url, caption, onOpen, captionTestId, testId }: {
  url: string;
  caption: string;
  onOpen?: () => void;
  captionTestId?: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col items-center" data-testid={testId}>
      <GroupChatQuietLink url={url} label={classifyGroupChat(url).label.replace(/^Join /, '')} onOpen={onOpen} />
      <p className="whitespace-pre-line text-xs text-muted-foreground [text-wrap:balance]" data-testid={captionTestId}>{caption}</p>
    </div>
  );
}

/**
 * P1542 round 6c (E): the join invitation, said one way wherever it appears (the feedback thank-you, and the room once
 * the feedback is in): the one blue button "Join <community>" and the line under it saying what follows.
 * Learned → the group terms; not yet (or part way) → the short learning first. The caller decides where onJoin goes.
 * (H) The label wraps to two balanced lines instead of crowding or clipping a long community name.
 */
export function JoinOffer({ community, learned, started, minutes, onJoin, testId = 'end-join' }: {
  community: string;
  learned: boolean;
  /** Part of the introduction already done. */
  started: boolean;
  /** Minutes the (rest of the) introduction takes; null while the estimate loads. */
  minutes: number | null;
  onJoin: () => void;
  testId?: string;
}) {
  const line = learned
    ? null
    : started
      ? minutes !== null
        ? `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} left of the introduction.`
        : 'Part of the introduction is left.'
      : minutes !== null
        ? `Starts with a ${minutes}-minute introduction to how we meet.`
        : 'Starts with a short introduction to how we meet.';
  return (
    <div className="flex w-full flex-col items-center gap-2" data-testid={testId}>
      <LetterPrimaryCta
        label={`Join ${community}`}
        onClick={onJoin}
        className="h-auto whitespace-normal px-6 py-3 text-center leading-tight [text-wrap:balance]"
      />
      {line && <p className="max-w-sm text-sm text-muted-foreground [text-wrap:balance]" data-testid="end-join-learn-first">{line}</p>}
    </div>
  );
}

/**
 * P1542 round 6 (A, decision 39): a hike's registration success — one calm block. The check, "You're registered", one
 * date · time · place line, then a row of quiet links (the group chat, Add to calendar, Share; the last two only before
 * the start). No buttons here: the page's one button is the learning invitation below, if any.
 */
export function RegisteredBlock({ event, groupChatUrl, viewerId, surface = 'registration_thankyou' }: {
  event: EventWithHost;
  groupChatUrl: string | null;
  viewerId: string | null;
  surface?: GroupChatSurface;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const { opened, markOpened } = useGroupChatOpened(event.id, groupChatUrl, viewerId);
  const start = new Date(event.datetime);
  const beforeStart = Date.now() < start.getTime();
  const date = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const calendarEvent = {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    slug: event.slug,
    startDate: start,
    endDate: new Date(start.getTime() + event.durationMinutes * 60 * 1000),
  };
  // On a phone, Share opens the share sheet (every app is there); elsewhere it opens the share row in place.
  const share = async () => {
    const sheet = typeof navigator !== 'undefined' && typeof navigator.share === 'function' && !!window.matchMedia?.('(pointer: coarse)').matches;
    if (sheet && (await shareOrCopy(event.title, eventPageUrl(event.slug))) !== 'failed') return;
    setShareOpen((o) => !o);
  };
  // Round 6b (founder: "don't advertise WhatsApp if already clicked"): once opened, the link is gone here entirely.
  // Round 10b: decided ONCE, at first paint, before the link read — from the event hint when the viewer is known; while
  // the viewer is not known yet (session restoring) the place is kept. Never re-decided afterwards: a kept place never
  // shrinks (a later "already opened" leaves it kept, unseen), so nothing below it moves.
  // Round 10f: the decision belongs to (event, viewer): another event — or another signed-in person — decides afresh.
  // The viewer becoming known for the SAME event is not a new decision (a kept place never shrinks).
  const decide = () => !!event.hasGroupChat && !(viewerId && readEventChatOpenedHint(viewerId, event.id));
  const [chatPlace, setChatPlace] = useState(() => ({ eventId: event.id, viewerId, keep: decide() }));
  let keepChatPlace = chatPlace.keep;
  if (chatPlace.eventId !== event.id || (chatPlace.viewerId && viewerId && chatPlace.viewerId !== viewerId)) {
    keepChatPlace = decide();
    setChatPlace({ eventId: event.id, viewerId, keep: keepChatPlace });
  } else if (!chatPlace.viewerId && viewerId) {
    setChatPlace({ eventId: event.id, viewerId, keep: chatPlace.keep });
  }
  // (Opened before → the link-keyed flag is set too, so `opened` is true at once and the link never shows here.)
  const chat = groupChatUrl && opened === false;
  return (
    <section className="flex flex-col items-center gap-2 text-center" data-testid="registered-card">
      <Check className="h-8 w-8 text-green-600" aria-hidden="true" data-testid="registered-check" />
      <h1 className="text-2xl font-bold leading-tight text-foreground [text-wrap:balance]">You&apos;re registered</h1>
      <p className="text-sm text-muted-foreground [text-wrap:balance]" data-testid="registered-when">
        {/* Round 6c: the place keeps together. On a phone it takes its own line (no separator left at a line's start or
            end); from 640px the line reads "date · time · place". */}
        <span className="whitespace-nowrap">{date} · {formatTime(start)}</span>
        <span className="hidden sm:inline"> · </span>
        <br className="sm:hidden" />
        <span className="inline-block">{placeLabel(event)}</span>
      </p>
      {/* Round 6b: one stack, so nothing wraps unevenly — the group chat with its purpose line directly under it, then
          "Add to calendar · Share" on their own row. Every link is a full 40px tap target. */}
      {chat && (
        <GroupChatOffer url={groupChatUrl} caption="Last-minute changes, questions, lifts." onOpen={() => markOpened(surface)} testId="registered-chat" captionTestId="group-chat-line" />
      )}
      {/* Round 10 (founder: "whatsapp group appears and then cta appears") / 10b: the chat offer's place is decided once,
          from what is known before any read — the event has a chat and this browser has not seen this person open it.
          Kept, it stays kept (unseen) whatever the reads then say — the link not coming, a failed read, opened elsewhere,
          or opened right here — so nothing below it ever moves. Not kept (opened before), the link never shows here. */}
      {!chat && keepChatPlace && (
        <div className="invisible" aria-hidden="true" data-testid="registered-chat-pending">
          <GroupChatOffer url={groupChatUrl ?? 'https://chat.whatsapp.com/'} caption="Last-minute changes, questions, lifts." />
        </div>
      )}
      {beforeStart && (
        <div className="flex items-center justify-center gap-3" data-testid="registered-links">
          <AddToCalendarMenu event={calendarEvent} trigger="link" />
          <span aria-hidden="true" className="text-sm text-muted-foreground">·</span>
          <button
            type="button"
            onClick={() => void share()}
            aria-expanded={shareOpen}
            className="inline-flex min-h-10 items-center whitespace-nowrap text-sm font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
            data-testid="registered-share"
          >
            Share
          </button>
        </div>
      )}
      {shareOpen && <EventShareRow title={event.title} url={eventPageUrl(event.slug)} label="" testId="registered-share-row" className="pt-2" />}
    </section>
  );
}

/** GroupChatBlock's own line (founder-authored; P1387, 2026-10-02: one line). Shared by the event box and
 *  the hike feedback thank-you (P1542 round 3), so the coordination words are said one way. */
export function GroupChatLine({ url, plain = false }: { url: string; plain?: boolean }) {
  const isWhatsApp = classifyGroupChat(url).provider === 'whatsapp';
  return (
    <p className="text-xs text-muted-foreground" data-testid="group-chat-line">
      {/* P1542 VQA round 5: `plain` (a hike, whose button right above already says "Join WhatsApp group") drops
          the repeated name and keeps only the purpose. Clarity Night keeps its founder-authored line. */}
      {plain ? 'Last-minute changes, questions, lifts.' : `${isWhatsApp ? 'WhatsApp group' : 'Group chat'}: last-minute changes, questions, lifts.`}
    </p>
  );
}

/**
 * The ONE event box — "You're Registered!" and the end screen: details, Add to calendar and the
 * group chat side by side, GroupChatBlock's line, then the share row (the event page, never this
 * flow's URL).
 */
export function EventBox({
  event,
  groupChatUrl,
  title,
  testId,
  note,
  plainChatLine = false,
}: {
  event: EventWithHost;
  groupChatUrl: string | null;
  title: ReactNode;
  testId: string;
  note?: ReactNode;
  /** P1542 VQA round 5 (a hike's end of learning): the caption without the repeated "WhatsApp group:", and the
   *  calendar and group chat stacked below 640px instead of wrapping to three lines side by side. */
  plainChatLine?: boolean;
}) {
  const pageUrl = eventPageUrl(event.slug);
  const start = new Date(event.datetime);
  const calendarEvent = {
    id: event.id,
    title: event.title,
    description: event.description,
    location: event.location,
    slug: event.slug,
    startDate: start,
    endDate: new Date(start.getTime() + event.durationMinutes * 60 * 1000),
  };
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-center shadow-sm" data-testid={testId}>
      {title}
      <EventDetails event={event} />
      {note}
      <div
        // AddToCalendarMenu's own outline Button, sized down to sit beside the group button.
        className={`grid gap-2 [&_button]:h-auto [&_button]:min-h-10 [&_button]:whitespace-normal [&_button]:px-2 [&_button]:text-sm ${groupChatUrl ? (plainChatLine ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2') : 'grid-cols-1'}`}
        data-testid={`${testId}-actions`}
      >
        <AddToCalendarMenu event={calendarEvent} />
        {groupChatUrl && <GroupChatButton url={groupChatUrl} />}
      </div>
      {groupChatUrl && <GroupChatLine url={groupChatUrl} plain={plainChatLine} />}
      {/* P1387 (founder, 2026-10-02): "Share" on the same line as the icons — on screens ≥640px. P1403:
          one shared row; below 640px the label takes its own line so all six buttons fit at 320px. */}
      <EventShareRow title={event.title} url={pageUrl} testId={`${testId}-share`} className="border-t border-border pt-3" />
    </section>
  );
}

/**
 * The social-proof line (founder, UAT 2026-10-01): earlier events and this event are two separate
 * scopes, named as such, so neither number reads as part of the other:
 *   both          → "12 people opted in at previous Clarity Nights, and 1 for this event"
 *   earlier only  → "11 people opted in at previous Clarity Nights"
 *   this only     → "3 people prepared for this event"
 * Nothing at 0. `previous` counts the series' earlier events only; `verb` is "prepared for" /
 * "opted in at".
 */
export function socialProofLine(verb: 'prepared for' | 'opted in at', previous: number, thisOne: number, label: string): string | null {
  const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
  const forThisEvent = verb === 'prepared for' ? 'prepared for this event' : 'opted in for this event';
  const earlier = label === 'our events' ? 'our previous events' : `previous ${label}`;
  if (previous <= 0 && thisOne <= 0) return null;
  if (previous <= 0) return `${people(thisOne)} ${forThisEvent}`;
  if (thisOne <= 0) return `${people(previous)} ${verb} ${earlier}`;
  return `${people(previous)} ${verb} ${earlier}, and ${thisOne} for this event`;
}

export function SocialProof({
  line,
  people,
  testId,
}: {
  line: string | null;
  people: SocialPerson[];
  testId: string;
}) {
  if (!line) return null;
  return (
    <div className="flex flex-col items-center gap-2 pt-1 text-center" data-testid={testId}>
      {people.length > 0 && (
        // At most 4 faces: the stack's "+N" counts the list it is given (capped at 5 by the RPC),
        // not the people — the line beside it carries the real number. Plain faces, no pledge
        // ring: here they only say "real people did this" (UAT 2026-10-01).
        <AttendeeAvatarStack size="lg" attendees={people.slice(0, 4).map((p) => ({ ...p, hasPledged: false }))} />
      )}
      <span className="text-sm text-muted-foreground">{line}</span>
    </div>
  );
}

/**
 * "Prepared ✓" or "{k} of {M} steps" — what the host checks on the attendee's phone. A quiet
 * line, not a badge: it confirms a state, it is not an action (UAT 2026-10-01: the green pill
 * read as a floating alert).
 */
export function PrepStatus({ progress, started }: { progress: Progress; started: boolean }) {
  if (progress.complete) {
    return (
      <span className="text-sm font-medium text-muted-foreground" data-testid="prep-status">
        Prepared <span className="text-green-600 dark:text-green-400">✓</span>
      </span>
    );
  }
  if (!started || progress.done === 0) return null;
  return (
    <span className="text-sm font-medium text-muted-foreground" data-testid="prep-status">
      {progress.done} of {progress.total} steps
    </span>
  );
}

/**
 * The confirmation's prep block (variant D, round E). The why line always shows. 0 done: the
 * question + Prepare now / Remind me by email. 1..M-1 done: "{k} of {M} steps done" + Continue
 * your preparation. Done: nothing here — the box carries "Prepared ✓". Never "0 of M".
 * P1387 (founder, 2026-10-02): leads the confirm page (above the registered card). On a phone the
 * buttons and the social proof pin; the bottom menu is hidden on this route.
 */
export function PrepBlock({
  progress,
  minutes,
  reminded,
  proof,
  onPrepare,
  onRemind,
}: {
  progress: Progress;
  minutes: number | null;
  reminded: boolean;
  proof: { line: string | null; people: SocialPerson[] };
  onPrepare: () => void;
  onRemind: () => void;
}) {
  if (progress.complete) return null;
  const notStarted = progress.done === 0;
  const actions = (
      <div className="flex flex-col items-center gap-1" data-testid="confirm-actions">
        <LetterPrimaryCta label={notStarted ? 'Prepare now' : 'Continue your preparation'} onClick={onPrepare} />
        {notStarted &&
          (reminded ? (
            <p
              aria-live="polite"
              className="flex min-h-11 items-center py-1 text-center text-sm font-medium text-green-600"
              data-testid="reminder-confirmation"
            >
              ✓ We&apos;ll email you a reminder
            </p>
          ) : (
            <LetterPrimaryCta label="Remind me by email" onClick={onRemind} variant="secondary" />
          ))}
      </div>
  );
  return (
    <>
      {/* P1387 (founder, 2026-10-02): the question leads the page, big — it is the main thing we ask
          — with ONE subtitle (was four sentences). [DRAFT] subtitle copy. */}
      <section className="space-y-2 pt-2 text-center" data-testid="prep-block">
        {notStarted ? (
          <>
            {/* Rendered at once: 10 stands in until the points load. */}
            <h1 className="text-2xl font-bold leading-tight text-foreground" data-testid="prep-question" data-ready={minutes !== null}>
              {`Do you have ${minutes ?? 10} minutes to prepare for the event?`}
            </h1>
          </>
        ) : (
          <h1 className="text-2xl font-bold leading-tight text-foreground" data-testid="prep-progress">
            {progress.done} of {progress.total} steps done
          </h1>
        )}
        {/* The why is always shown (P1336), in both states. */}
        <p className="text-base leading-relaxed text-muted-foreground" data-testid="prep-why">
          Our events have a special structure. A short preparation makes the discussions more meaningful.
        </p>
      </section>
      {/* On a phone the decision is pinned with its social proof (as the opt-in step does), and
          enters once with a soft slide-up — no repeating pulse. Desktop: in the page under the
          question. The bottom menu is hidden on this route, as on every prep step. */}
      <FixedBottomBar className="animate-in fade-in slide-in-from-bottom-4 duration-500 lg:static lg:mt-4 lg:animate-none lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
        {notStarted && proof.line && (
          <div className="mb-2 w-full max-w-sm">
            <SocialProof testId="prepared-proof" line={proof.line} people={proof.people} />
          </div>
        )}
        {actions}
      </FixedBottomBar>
    </>
  );
}
