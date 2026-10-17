/**
 * @file real-data.ts
 * @description P1509 v16: the ONE thin adapter between the prototype and the app's existing data services. It calls
 * services that already exist (src/app/data/*) and maps the results to what the views need; it adds no service, no
 * table and no query of its own. Nothing here writes except the two real flows v16 reuses unchanged: the persona
 * sign-in (a session on the TEST project) and `rsvpToEvent` / `cancelRsvp`. Position changes on a card, joining or
 * leaving a group and the partner invite stay local overlays (state.ts) and never reach the database.
 *
 * Reads, and the service each one uses (also the build report's table):
 *   feed             offline-reads `feedRead` (the production feed's own read: getPublicPointsFeed + getPublicStoriesFeed)
 *                    + storiesService.getPointsForStories / getStoriesForPoints (the cards' expanders)
 *   my shareables    pointsService.getPointsForProfileDisplay + storiesService.getStoriesByAuthor + getPointsForStories
 *   profile          api.getProfileBySlug
 *   letters          letters-service getInboxItems / docsService.getDocsByUser / letters-service getAllSentLetters
 *   groups           offline-reads `groupsRead` (organizationsService list + counts + participation + my memberships + summaries)
 *   events list      eventsService.getUpcomingEvents() / getPastEvents() with no group (every public event, as /events/list)
 *   group page       organizationsService.getOrganizationBySlug / getMembers / getMyMembership + eventsService.getUpcomingEvents / getPastEvents
 *   event page       eventsService.getEventBySlug / getEventAttendees / isUserRsvpd; writes rsvpToEvent / cancelRsvp
 *   partners         agreementsService.getAgreementsForProfile + getIncomingInvitations (also the source of Invite partner -> Invite sent -> Partner)
 *   is_admin         topic-voting getAdminTopics (the admin_list_topics RPC asserts is_admin in Postgres; null = not an admin)
 *
 * The `?real=loading|error|empty` override forces every real surface into that state (so each can be screenshotted)
 * without calling a service.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { feedRead, groupsRead, type GroupsDirectory } from '@/app/data/offline-reads';
import { storiesService } from '@/app/data/stories-service';
import { pointsService } from '@/app/data/points-service';
import { getProfileBySlug } from '@/app/data/api';
import { getAllSentLetters, getDeliveriesForLetter, getInboxItems } from '@/app/data/letters-service';
import { docsService } from '@/app/data/docs-service';
import { organizationsService } from '@/app/data/organizations-service';
import { eventsService } from '@/app/data/events-service';
import { agreementsService } from '@/app/data/agreements-service';
import { getAdminTopics } from '@/app/data/topic-voting';
import { filterAgreementsForViewer } from '@/app/components/agreements/filter-agreements';
import { formatTimeAgo } from '@/app/utils/format-time';
import type { ClarityAgreement } from '@/app/data/agreements-service.interface';
import type { Organization, OrgMember, OrgRole } from '@/app/data/organizations-service.interface';
import type { EventAttendee, EventWithHost, LetterDelivery, PointSummary, PointWithUserPosition, Profile, StoryWithAuthor } from '@/app/types';
import { isSeededPersonaEmail, PERSONA_SESSION_ENDPOINT, personaFromSlug, personaSlug } from './personas';
import { seedEventSlug } from './seed-world';
import { COPY, EVENTS, GROUPS, type LetterBox, type PersonId, type Shareable, type ViewerId } from './mock-data';

export type { GroupsDirectory };

/* ---------- the viewer: whoever is signed in ---------- */

/** The chat world has two lenses. A signed-in test persona other than Bob or Dana, or a non-persona, has none. */
export const viewerOf = (user: { slug?: string | null } | null | undefined): ViewerId | null => {
  const id = personaFromSlug(user?.slug);
  return id === 'bob' || id === 'dana' ? id : null;
};

export type SignInResult = { ok: true } | { ok: false; error: string };

/**
 * Sign in as a seeded test persona: the dev server hands back a session (never a password) and the app's own supabase
 * client applies it, so AuthProvider picks it up exactly like a real sign-in. 409 = the personas are not seeded.
 */
export async function signInAsPersona(id: ViewerId): Promise<SignInResult> {
  let res: Response;
  try {
    res = await fetch(PERSONA_SESSION_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  } catch {
    return { ok: false, error: 'Could not reach the dev server. Persona sign-in only exists on the local dev server.' };
  }
  let body: { access_token?: string; refresh_token?: string; error?: string } = {};
  try { body = await res.json(); } catch { /* not JSON: the endpoint is not served here */ }
  if (!res.ok) return { ok: false, error: body.error ?? `Sign-in failed (${res.status}).` };
  if (!body.access_token || !body.refresh_token) return { ok: false, error: 'Persona sign-in is only available on the local dev server.' };
  const { error } = await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ---------- one query shape for every real surface ---------- */

export type RealOverride = 'loading' | 'error' | 'empty';
export type Query<T> = {
  status: 'loading' | 'error' | 'ready';
  /** Undefined until the first answer lands (a surface whose answer is "none" has `null` here, not undefined). */
  data: T | undefined;
  /** Ready with nothing to show. */
  empty: boolean;
  /** Retry after an error: back to the skeleton, then the read again. */
  retry: () => void;
  /** Read again in place (after an RSVP): the data on screen stays until the new answer lands. */
  refresh: () => void;
};

/** `?real=` forces every real surface into one state. */
export function useRealOverride(): RealOverride | null {
  const [params] = useSearchParams();
  const v = params.get('real');
  return v === 'loading' || v === 'error' || v === 'empty' ? v : null;
}

/**
 * Run `fetcher` when `deps` change (and when Retry is pressed). A stale answer never overwrites a newer one. With
 * `?real=` set the service is not called: loading never resolves, error offers a Retry that fails again, empty is `emptyValue`.
 */
export function useRealQuery<T>(fetcher: () => Promise<T>, deps: unknown[], opts: { emptyValue: T; isEmpty: (v: T) => boolean; enabled?: boolean }): Query<T> {
  const override = useRealOverride();
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<{ status: Query<T>['status']; data: T | undefined }>({ status: 'loading', data: undefined });
  const [nonce, setNonce] = useState(0);
  const run = useRef(0);
  const silent = useRef(false);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;
  useEffect(() => {
    if (override || !enabled) return;
    const id = ++run.current;
    const keep = silent.current;
    silent.current = false;
    if (!keep) setState({ status: 'loading', data: undefined });
    fetchRef.current().then(
      (data) => { if (id === run.current) setState({ status: 'ready', data }); },
      () => { if (id === run.current) setState((s) => (keep && s.data !== undefined ? s : { status: 'error', data: undefined })); },
    );
    return () => { run.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [override, enabled, nonce, ...deps]);
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  const refresh = useCallback(() => { silent.current = true; setNonce((n) => n + 1); }, []);
  if (override === 'loading' || !enabled) return { status: 'loading', data: undefined, empty: false, retry, refresh };
  if (override === 'error') return { status: 'error', data: undefined, empty: false, retry, refresh };
  if (override === 'empty') return { status: 'ready', data: opts.emptyValue, empty: true, retry, refresh };
  return { status: state.status, data: state.data, empty: state.status === 'ready' && state.data !== undefined && opts.isEmpty(state.data), retry, refresh };
}

/* ---------- is_admin ---------- */

/**
 * Whether the signed-in profile is an admin. There is no client read of `is_admin`; `admin_list_topics` asserts it in
 * Postgres and the service returns null for anyone else. Fails CLOSED: loading, an error and a non-admin all read false.
 */
export function useIsAdmin(profileId: string | undefined): boolean {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    setAdmin(false);
    if (!profileId) return;
    let live = true;
    getAdminTopics().then((t) => { if (live) setAdmin(t !== null); }, () => { if (live) setAdmin(false); });
    return () => { live = false; };
  }, [profileId]);
  return admin;
}

/* ---------- Home: the feed ---------- */

export interface FeedData {
  stories: StoryWithAuthor[];
  points: PointWithUserPosition[];
  /** storyId -> its linked points; absent while a link read failed (the card then shows no expander, as in production). */
  storyPoints: Map<string, PointSummary[]>;
  /** pointId -> the stories that carry it. */
  pointStories: Map<string, StoryWithAuthor[]>;
}

export async function loadFeed(viewerProfileId: string): Promise<FeedData> {
  const rows = await feedRead(viewerProfileId, false, undefined).fetch();
  const stories = rows?.stories ?? [];
  const points = rows?.points ?? [];
  const [storyPoints, pointStories] = await Promise.all([
    stories.length ? storiesService.getPointsForStories(stories.map((s) => s.id), viewerProfileId).catch(() => new Map<string, PointSummary[]>()) : new Map<string, PointSummary[]>(),
    points.length ? storiesService.getStoriesForPoints(points.map((p) => p.id)).catch(() => new Map<string, StoryWithAuthor[]>()) : new Map<string, StoryWithAuthor[]>(),
  ]);
  return { stories, points, storyPoints, pointStories };
}

/* ---------- the Share picker: my own points and stories ---------- */

const STORY_TITLE_MAX = 80;
const storyTitle = (s: StoryWithAuthor) => (s.content.length > STORY_TITLE_MAX ? `${s.content.slice(0, STORY_TITLE_MAX).trimEnd()}…` : s.content);

export async function loadMyShareables(profileId: string): Promise<Shareable[]> {
  const [points, stories] = await Promise.all([
    pointsService.getPointsForProfileDisplay(profileId, profileId),
    storiesService.getStoriesByAuthor(profileId),
  ]);
  const linked = stories.length ? await storiesService.getPointsForStories(stories.map((s) => s.id), profileId).catch(() => new Map<string, PointSummary[]>()) : new Map<string, PointSummary[]>();
  return [
    ...points.map((p): Shareable => ({ id: p.id, kind: 'point', title: p.statement, tags: p.tags ?? [], real: { point: p } })),
    ...stories.map((s): Shareable => ({ id: s.id, kind: 'story', title: storyTitle(s), tags: s.tags ?? [], real: { story: s, linkedPoints: linked.get(s.id) } })),
  ];
}

/* ---------- profiles ---------- */

/** Null = no such profile (the persona was not seeded): an empty state, not an error. */
export const loadProfile = (slug: string): Promise<Profile | null> => getProfileBySlug(slug);

/* ---------- Letters ---------- */

/** A button on a letter card: the production page it opens. The first action is the card's one solid button. */
export interface LetterAction { label: string; href: string; /** The card's one solid button. */ primary?: boolean }

export interface LetterRowData {
  id: string;
  box: LetterBox;
  title: string;
  /** Who it is from (inbox), else the viewer's own name. */
  who: string;
  whoSlug: string | null;
  when: string;
  /** What the card's buttons do (Read / Results, Prepare + Edit, Open overview). The card body itself opens nothing. */
  actions: LetterAction[];
  /** Drafts: "2 stories · 1 point". */
  summary?: string;
  /** Inbox only. */
  unread?: boolean;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export async function loadLetters(box: LetterBox, profileId: string, myName: string): Promise<LetterRowData[]> {
  if (box === 'inbox') {
    const items = await getInboxItems(profileId);
    return items.map((i) => ({
      id: i.delivery_id, box, title: i.title, who: i.actor_name, whoSlug: i.actor_slug ?? null, when: formatTimeAgo(i.timestamp), unread: !i.read_at,
      actions: i.type === 'received' && !i.completed_at
        ? [{ label: 'Read', href: `/letter/${i.delivery_id}`, primary: true }]
        : [{ label: 'Results', href: `/letter/${i.letter_id}/results?delivery=${i.delivery_id}`, primary: true }],
    }));
  }
  if (box === 'drafts') {
    const docs = await docsService.getDocsByUser(profileId);
    return docs.map((d) => ({
      id: d.id, box, title: d.title?.trim() || 'Untitled', who: myName, whoSlug: null, when: formatTimeAgo(d.updated_at),
      summary: `${plural(d.story_count, 'story', 'stories')} · ${plural(d.point_count, 'point', 'points')}`,
      actions: [{ label: 'Edit', href: `/letters/drafts/${d.id}` }, { label: 'Prepare', href: `/letter/${d.id}/compose`, primary: true }],
    }));
  }
  const sent = await getAllSentLetters(profileId);
  return sent.map((l) => ({ id: l.id, box, title: l.doc_title, who: myName, whoSlug: null, when: formatTimeAgo(l.sealed_at ?? l.created_at), actions: [{ label: 'Open overview', href: `/letter/${l.id}/overview`, primary: true }] }));
}

/** A published letter's deliveries (its card's expander), as the Published tab lists them. */
export const loadDeliveries = (letterId: string): Promise<LetterDelivery[]> => getDeliveriesForLetter(letterId);

/* ---------- Groups ---------- */

export async function loadGroupsDirectory(): Promise<GroupsDirectory> {
  const dir = await groupsRead().fetch();
  if (!dir) throw new Error('Groups unavailable');
  return dir;
}

/** The chat world's group id for a real org: the org slug IS the mock group id ('cm', 'online'). */
export const chatGroupOf = (slug: string) => GROUPS.find((g) => g.id === slug)?.id ?? null;
/** The chat world's event id for a real event: matched by slug (`seedEventSlug(mockEventId)`; titles carry the seed day's date, the id is stable). */
export const chatEventOf = (eventSlug: string) => EVENTS.find((e) => seedEventSlug(e.id) === eventSlug)?.id ?? null;

export interface GroupDetail {
  org: Organization;
  members: OrgMember[];
  myRole: OrgRole | null;
  upcoming: EventWithHost[];
  past: EventWithHost[];
}

/** Null when no public group has this slug. */
export async function loadGroupDetail(slug: string): Promise<GroupDetail | null> {
  const org = await organizationsService.getOrganizationBySlug(slug);
  if (!org) return null;
  const [members, mine, upcoming, past] = await Promise.all([
    organizationsService.getMembers(slug),
    organizationsService.getMyMembership(org.id).catch(() => null),
    org.hasEvents ? eventsService.getUpcomingEvents(org.id) : Promise.resolve([] as EventWithHost[]),
    org.hasEvents ? eventsService.getPastEvents(org.id) : Promise.resolve([] as EventWithHost[]),
  ]);
  return { org, members, myRole: mine?.role ?? null, upcoming, past };
}

/* ---------- Events ---------- */

export interface EventDetail {
  event: EventWithHost;
  attendees: EventAttendee[];
  going: boolean;
  /** The group it belongs to (events carry no org field, so it is found from the org's own event lists). */
  org: Organization | null;
}

/** Every public event, upcoming then past: the Events place (production's /events/list reads the same two services with no group). */
export interface EventsList { upcoming: EventWithHost[]; past: EventWithHost[] }
export async function loadEventsList(): Promise<EventsList> {
  const [upcoming, past] = await Promise.all([eventsService.getUpcomingEvents(), eventsService.getPastEvents()]);
  return { upcoming, past };
}

/** `?event=chat:<mock event id>` is the chat mock's event header: it opens the real event seeded under that mock id. */
export const CHAT_EVENT_REF = 'chat:';

/** The chat mock's event header opens the real event with the seeded slug of the same mock id; no such event reads as "does not exist". */
const slugOfChatEvent = (mockEventId: string): string | null => (EVENTS.some((e) => e.id === mockEventId) ? seedEventSlug(mockEventId) : null);

/** The people going to the real event seeded under a chat-mock event id: an event channel's members (null = no such event in the test project). */
export async function loadChatEventAttendees(mockEventId: string): Promise<EventAttendee[] | null> {
  const slug = slugOfChatEvent(mockEventId);
  if (!slug) return null;
  const event = await eventsService.getEventBySlug(slug);
  return event ? eventsService.getEventAttendees(event.id) : null;
}

export async function loadEventDetail(ref: string, viewerProfileId: string, groupHint?: string): Promise<EventDetail | null> {
  const slug = ref.startsWith(CHAT_EVENT_REF) ? await slugOfChatEvent(ref.slice(CHAT_EVENT_REF.length)) : ref;
  if (!slug) return null;
  const event = await eventsService.getEventBySlug(slug);
  if (!event) return null;
  const [attendees, going, org] = await Promise.all([
    eventsService.getEventAttendees(event.id),
    eventsService.isUserRsvpd(event.id, viewerProfileId),
    findEventOrg(event.id, groupHint),
  ]);
  return { event, attendees, going, org };
}

async function findEventOrg(eventId: string, hint?: string): Promise<Organization | null> {
  try {
    const orgs = hint ? [await organizationsService.getOrganizationBySlug(hint)].filter((o): o is Organization => !!o) : await organizationsService.listPublicOrganizations();
    for (const o of orgs.filter((x) => x.hasEvents)) {
      const [up, past] = await Promise.all([eventsService.getUpcomingEvents(o.id), eventsService.getPastEvents(o.id)]);
      if ([...up, ...past].some((e) => e.id === eventId)) return o;
    }
  } catch { /* the Back link then falls back to the directory */ }
  return null;
}

/** The real RSVP flow, unchanged: the services decide capacity, cancelled events and duplicates. */
export const rsvp = (eventId: string, profileId: string) => eventsService.rsvpToEvent(eventId, profileId);
export const cancelRsvp = (eventId: string, profileId: string) => eventsService.cancelRsvp(eventId, profileId);

/* ---------- Partners ---------- */

export interface PartnersData {
  /** Active agreements, and the pending invitations I sent (as the Partners page lists them). */
  agreements: ClarityAgreement[];
  /** Pending agreements addressed to me that I have not signed. */
  incoming: ClarityAgreement[];
}

export async function loadPartners(profile: { id: string; email?: string | null }): Promise<PartnersData> {
  const all = await agreementsService.getAgreementsForProfile(profile.id, profile.id);
  const visible = filterAgreementsForViewer(all, profile.id, profile.id);
  // As profile-connections-page: outgoing invitations here, incoming ones apart (getIncomingInvitations).
  const agreements = visible.filter((a) => a.status === 'active' || (a.status === 'pending' && a.creatorProfileId === profile.id));
  const incoming = profile.email ? await agreementsService.getIncomingInvitations(profile.email, profile.id).catch(() => [] as ClarityAgreement[]) : [];
  return { agreements, incoming };
}

export type InviteResult = { ok: true } | { ok: false; reason: 'refused' | 'failed'; message: string };

/**
 * Invite partner, the one real write the partner flow makes: the existing `agreementsService.createAgreement`, unchanged
 * (production's mail function sends the invitation through a live mail key).
 * SAFETY, in this order and before anything else: the recipient must be a seeded persona address (`.invalid`, which can
 * never be delivered); anything else is refused HERE, with no profile lookup, no agreement and no mail request.
 * A picked persona is invited by profile id (as production's picker does), a typed persona address by email.
 */
export async function sendPartnerInvite(input: { email: string; personId?: PersonId; name: string; termsText: string }): Promise<InviteResult> {
  if (!isSeededPersonaEmail(input.email)) return { ok: false, reason: 'refused', message: COPY.inviteRefused };
  try {
    const partnerProfileId = input.personId ? (await loadProfile(personaSlug(input.personId)).catch(() => null))?.id : undefined;
    const agreement = await agreementsService.createAgreement({
      partnerEmail: input.email.trim().toLowerCase(), partnerProfileId, partnerDisplayName: input.name, termsText: input.termsText.trim(), visibility: 'private',
    });
    return agreement ? { ok: true } : { ok: false, reason: 'failed', message: 'Could not send the invite. You may already have an agreement with this person.' };
  } catch {
    return { ok: false, reason: 'failed', message: 'Could not send the invite. Check your connection and try again.' };
  }
}

/**
 * Invite partner -> Invite sent -> Partner, from the agreements the service returned: an active agreement with a test
 * persona is a Partner; a pending one I sent is Invite sent. Invitations addressed to me are not "sent" by me.
 */
export function partnerStatesFrom(data: PartnersData, myProfileId: string): Partial<Record<PersonId, 'pending' | 'partner'>> {
  const out: Partial<Record<PersonId, 'pending' | 'partner'>> = {};
  for (const a of data.agreements) {
    const other = a.creatorProfileId === myProfileId ? a.partner : a.creator;
    const id = personaFromSlug(other?.slug);
    if (!id) continue;
    if (a.status === 'active') out[id] = 'partner';
    else if (a.status === 'pending' && a.creatorProfileId === myProfileId && out[id] !== 'partner') out[id] = 'pending';
  }
  return out;
}

/* ---------- pure helpers shared by the views ---------- */

/** The persona behind a real profile slug, if it is one. */
export const personaOfSlug = (slug: string | null | undefined): PersonId | null => personaFromSlug(slug);
