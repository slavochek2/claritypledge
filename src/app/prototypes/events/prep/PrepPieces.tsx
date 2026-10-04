/**
 * @file PrepPieces.tsx
 * @description P1336 — the page-local compositions the approved prototype (/tree/p1336-d)
 * named: EventBox, SocialProof, the prep status badge and the confirmation PrepBlock. Each is
 * assembled from existing product components (RsvpConfirm's card, AddToCalendarMenu,
 * GroupChatBlock's glyphs and line, EventCard's AttendeeAvatarStack, LetterPrimaryCta)
 * — none of those is copied or restyled here.
 */
import type { ReactNode } from 'react';
import { FixedBottomBar } from '@/app/components/shared/fixed-bottom-bar';
import { Calendar, MapPin, MessagesSquare, Video } from 'lucide-react';
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

export const eventPageUrl = (slug: string) => `${window.location.origin}/events/${slug}`;

/** "Clarity Nights" for that series; any other preparation event reads "our events". */
export const seriesLabel = (event: Pick<EventWithHost, 'title'>) =>
  /clarity night/i.test(event.title) ? 'Clarity Nights' : 'our events';

/** RsvpConfirm's event details block. */
function EventDetails({ event }: { event: EventWithHost }) {
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
            {getLocationDisplayLabel(location, event.location)}
          </a>
        </div>
      </div>
    </div>
  );
}

function GroupChatButton({ url }: { url: string }) {
  const href = safeLinkHref(url);
  if (!href) return null;
  const { label, provider } = classifyGroupChat(url);
  const glyph = provider === 'whatsapp' ? WHATSAPP_GLYPH : provider === 'telegram' ? TELEGRAM_GLYPH : null;
  return (
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
}: {
  event: EventWithHost;
  groupChatUrl: string | null;
  title: ReactNode;
  testId: string;
  note?: ReactNode;
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
  const isWhatsApp = !!groupChatUrl && classifyGroupChat(groupChatUrl).provider === 'whatsapp';
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-center shadow-sm" data-testid={testId}>
      {title}
      <EventDetails event={event} />
      {note}
      <div
        // AddToCalendarMenu's own outline Button, sized down to sit beside the group button.
        className={`grid gap-2 [&_button]:h-auto [&_button]:min-h-10 [&_button]:whitespace-normal [&_button]:px-2 [&_button]:text-sm ${groupChatUrl ? 'grid-cols-2' : 'grid-cols-1'}`}
        data-testid={`${testId}-actions`}
      >
        <AddToCalendarMenu event={calendarEvent} />
        {groupChatUrl && <GroupChatButton url={groupChatUrl} />}
      </div>
      {groupChatUrl && (
        // GroupChatBlock's own line (founder-authored).
        <p className="text-xs text-muted-foreground">
          {/* P1387 (founder, 2026-10-02): one line. */}
          {isWhatsApp ? 'WhatsApp group' : 'Group chat'}: last-minute changes, questions, lifts.
        </p>
      )}
      {/* P1387 (founder, 2026-10-02): "Share" on the same line as the icons. P1403: one shared row. */}
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
              Do you have {minutes ?? 10} minutes to prepare for the event?
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
