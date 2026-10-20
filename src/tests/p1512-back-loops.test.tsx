/**
 * @file p1512-back-loops.test.tsx
 * @description P1512 review (HIGH): now that a parent's Back POPS, a child screen that returns to its parent with a
 * PUSH makes the parent's Back land on the child again (parent -> child -> push parent -> Back -> child ...).
 * One regression test per pair: grandparent -> parent -> child, the child's return, then the PARENT's Back must
 * land on the grandparent. The child is the real component; the parent and grandparent are stubs, the parent
 * carrying a real FocusHeader like every page that declares Back.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';

// ── Collaborators of the real children ───────────────────────────────────────────────────────────
const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));

const orgSvc = vi.hoisted(() => ({
  getOrganizationBySlug: vi.fn(),
  getMyMembership: vi.fn(),
  joinOrganization: vi.fn(),
}));
vi.mock('@/app/data/organizations-service', () => ({ organizationsService: orgSvc }));

const eventsSvc = vi.hoisted(() => ({
  getEventBySlug: vi.fn(),
  getEventGroupChatUrl: vi.fn(),
  updateEvent: vi.fn(),
  isUserRsvpd: vi.fn(),
  getUpcomingEvents: vi.fn(),
  getEventAttendees: vi.fn(),
}));
vi.mock('@/app/data/events-service', () => ({ eventsService: eventsSvc }));

const docsSvc = vi.hoisted(() => ({ getDoc: vi.fn() }));
vi.mock('@/app/data/docs-service', () => ({ docsService: docsSvc }));
vi.mock('@/app/data/letters-service', () => ({}));
vi.mock('@/lib/letter-emails', () => ({ invokeLetterEmails: vi.fn() }));
vi.mock('@/app/data/points-service', () => ({ pointsService: { getMyPositionsForPoints: vi.fn().mockResolvedValue(new Map()) } }));
vi.mock('@/app/utils/compose-default-point-order', () => ({ persistDefaultPointOrders: vi.fn() }));
// The compose phases are driven by their own tests; here each is a button that fires the same callback the
// real component fires when the person closes it.
vi.mock('@/app/components/letters/letter-receiver-modal', () => ({
  LetterReceiverModal: ({ onOpenChange }: { onOpenChange: (o: boolean) => void }) => (
    <button onClick={() => onOpenChange(false)}>close receiver modal</button>
  ),
}));
vi.mock('@/app/components/letters/letter-prediction-walk', () => ({
  LetterPredictionWalk: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>close prediction walk</button>,
}));

// ── The event room pages (Ready, Host, Close, Prepare) ───────────────────────────────────────────
const room = vi.hoisted(() => ({ access: {} as Record<string, unknown> }));
vi.mock('@/app/prototypes/events/components/EventRoomAccess', () => ({
  useEventRoomAccess: () => room.access,
  useEventRoomSelf: () => ({ self: null, loading: false, refresh: vi.fn() }),
}));
vi.mock('@/app/data/event-room-service', () => ({
  getRoomReadinessDistribution: vi.fn().mockResolvedValue([]),
  setRoomReadiness: vi.fn(),
  subscribeToRoomRoster: vi.fn(() => () => {}),
}));
vi.mock('@/app/prototypes/events/prep/PrepRoom', () => ({ PrepRoomBanner: () => null }));
vi.mock('@/app/data/event-rounds-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/event-rounds-service')>()),
  getEventRoundsState: vi.fn().mockResolvedValue({ rounds: [], seatsByRound: new Map(), topics: new Map() }),
  getRoundPresence: vi.fn().mockResolvedValue(new Map()),
  getTranscribingNow: vi.fn().mockResolvedValue(new Set()),
}));
vi.mock('@/app/data/event-prep-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/event-prep-service')>()),
  getPrepHostView: vi.fn().mockResolvedValue([]),
  getResearchPlacesLeft: vi.fn().mockResolvedValue(3),
}));
vi.mock('@/app/prototypes/events/rounds/use-tag-positions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/prototypes/events/rounds/use-tag-positions')>()),
  useTagPositions: () => new Map(),
}));
vi.mock('@/app/data/event-topic-tags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/event-topic-tags')>()),
  getEventTopicTags: vi.fn().mockResolvedValue([]),
}));
const closeSvc = vi.hoisted(() => ({ close: {} as Record<string, unknown> }));
vi.mock('@/app/data/event-close-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/event-close-service')>()),
  getEventClose: vi.fn(() => Promise.resolve(closeSvc.close)),
  getCommunitySlug: vi.fn().mockResolvedValue(null),
  getSeriesPeople: vi.fn().mockResolvedValue(0),
}));
const prepState = vi.hoisted(() => ({ value: {} as Record<string, unknown>, fresh: null as null | Record<string, unknown> }));
vi.mock('@/app/prototypes/events/prep/use-prep-state', async (importOriginal) => {
  const { useLocation } = await import('react-router-dom');
  return {
    ...(await importOriginal<typeof import('@/app/prototypes/events/prep/use-prep-state')>()),
    // `fresh` (a person who has not prepared) on any page but /prepare, so the confirm screen offers "Prepare now";
    // the completed state on /prepare itself, so it lands on its end screen.
    usePrepState: () => {
      const path = useLocation().pathname;
      return prepState.fresh && !path.endsWith('/prepare') ? prepState.fresh : prepState.value;
    },
    loadTagPoints: vi.fn().mockResolvedValue([]),
  };
});
vi.mock('@/app/data/stories-service', () => ({ storiesService: { getPublicStoriesFeed: vi.fn().mockResolvedValue([]) } }));
vi.mock('@/app/data/agent-accounts-service', () => ({ getAgentAccounts: vi.fn().mockResolvedValue(new Map()) }));
vi.mock('@/app/data/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/data/api')>()),
  getProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/app/pages/stake-page', () => ({ StakePage: () => null }));

import { OrgJoinPage } from '@/app/pages/org-join-page';
import { EventRoomReady } from '@/app/prototypes/events/components/EventRoomReady';
import { EventHostPage } from '@/app/prototypes/events/rounds/EventHostPage';
import { EventClosePage } from '@/app/prototypes/events/close/EventClosePage';
import { EventPrepPage } from '@/app/prototypes/events/prep/EventPrepPage';
import { LetterComposePage } from '@/app/pages/letter-compose-page';
import { LetterSealConfirmation } from '@/app/components/letters/letter-seal-confirmation';
import { EditEvent } from '@/app/prototypes/events/components/EditEvent';
import { RsvpConfirm } from '@/app/prototypes/events/components/RsvpConfirm';

function Page({ name }: { name: string }) {
  return <p data-testid="page">{name}</p>;
}

function DocRedirect() {
  const { docId } = useParams();
  // As in App.tsx: /d/:docId redirects (replace) to the draft.
  return <Navigate to={`/letters/drafts/${docId}`} replace />;
}

interface ScenarioOpts {
  grandparent: string;
  parentPath: string;
  parentRoute: string;
  parentFallback: string;
  childPath: string;
  childRoute: string;
  child: React.ReactNode;
  linkState?: unknown;
}

/** Mount grandparent -> parent, open the child from the parent (a push), return the child's way. */
function mount(o: ScenarioOpts) {
  const Parent = () => (
    <>
      <FocusHeader fallback={o.parentFallback} />
      <Page name="parent" />
      <Link to={o.childPath} state={o.linkState}>open child</Link>
    </>
  );
  return render(
    <MemoryRouter initialEntries={[o.grandparent, o.parentPath]} initialIndex={1}>
      <Routes>
        <Route path={o.grandparent} element={<Page name="grandparent" />} />
        <Route path={o.parentRoute} element={<Parent />} />
        <Route path={o.childRoute} element={<><Page name="child" />{o.child}</>} />
        <Route path="/d/:docId" element={<DocRedirect />} />
        <Route path="*" element={<Page name="other" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const page = () => screen.getByTestId('page').textContent;

async function openChild() {
  fireEvent.click(screen.getByText('open child'));
  await waitFor(() => expect(page()).toBe('child'));
}

/** After the child's return the parent shows; its Back must land on the grandparent, not on the child. */
async function expectParentBackReachesGrandparent() {
  await waitFor(() => expect(page()).toBe('parent'));
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  await waitFor(() => expect(page()).toBe('grandparent'));
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.value = { user: null, session: null, isLoading: false, sessionChecked: true };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Groups -> group -> Join ──────────────────────────────────────────────────────────────────────
describe('Groups -> group -> Join: Join returns the way it came', () => {
  const org = { id: 'org-1', slug: 'cm', name: 'CM', blurb: null, description: null, visibility: 'public', hasEvents: false };
  const opts = (): ScenarioOpts => ({
    grandparent: '/groups', parentPath: '/groups/cm', parentRoute: '/groups/:slug', parentFallback: '/groups',
    childPath: '/groups/cm/join', childRoute: '/groups/:slug/join', child: null,
  });

  beforeEach(() => {
    orgSvc.getOrganizationBySlug.mockResolvedValue(org);
    orgSvc.getMyMembership.mockResolvedValue(null);
  });

  it("the page's own Back", async () => {
    mount({ ...opts(), child: <OrgJoinPage /> });
    // The stub child route renders both the stub and the real page; the real page loads the org first.
    await openChild();
    fireEvent.click(await screen.findAllByRole('button', { name: 'Go back' }).then(b => b[b.length - 1] as HTMLElement));
    await expectParentBackReachesGrandparent();
  });

  it('a member reading the terms: "Back to <group>" returns the same way', async () => {
    auth.value = { user: { id: 'u1' }, session: { user: { id: 'u1' } }, isLoading: false, sessionChecked: true };
    orgSvc.getMyMembership.mockResolvedValue({ role: 'member', termsVersion: 1, acceptedAt: '2026-01-01' });
    mount({ ...opts(), child: <OrgJoinPage /> });
    await openChild();
    fireEvent.click(await screen.findByRole('button', { name: 'Back to CM' }));
    await expectParentBackReachesGrandparent();
  });
});

// ── draft -> compose -> back to the draft ───────────────────────────────────────────────────────
describe('draft -> compose: every way back from compose returns the way it came', () => {
  const doc = { id: 'doc-1', visibility: 'private', title: 'T', story_count: 1, point_count: 0, has_sent_letters: false };
  const stories = [{ story_id: 's1', point_config: null, story: { id: 's1', points: [] } }];
  const opts = (): ScenarioOpts => ({
    grandparent: '/letters', parentPath: '/letters/drafts/doc-1', parentRoute: '/letters/drafts/:docId', parentFallback: '/letters',
    childPath: '/letter/doc-1/compose', childRoute: '/letter/:docId/compose', child: <LetterComposePage />,
  });

  beforeEach(() => {
    auth.value = { user: { id: 'u1' }, session: { user: { id: 'u1' } }, isLoading: false, sessionChecked: true };
    docsSvc.getDoc.mockResolvedValue({ doc, stories });
  });

  it('closing the receiver modal', async () => {
    mount(opts());
    await openChild();
    fireEvent.click(await screen.findByText('close receiver modal'));
    await expectParentBackReachesGrandparent();
  });

  it('closing the prediction walk', async () => {
    mount({ ...opts(), linkState: { mode: 'one-to-one', emails: ['a@example.com'], receiverName: 'Ann' } });
    await openChild();
    fireEvent.click(await screen.findByText('close prediction walk'));
    await expectParentBackReachesGrandparent();
  });
});

describe('seal confirmation: "Back to Doc" goes to the doc, the way the author came ONLY if the doc opened compose', () => {
  const seal = (isPublicDoc: boolean, openedFromDoc: boolean) => (
    <LetterSealConfirmation docId="doc-1" receiverName="Ann" mode={isPublicDoc ? 'one-to-many' : 'one-to-one'} storyCount={1} letterId="l-1" isPublicDoc={isPublicDoc} openedFromDoc={openedFromDoc} />
  );

  it.each([[false], [true]])('opened from the doc page (isPublicDoc=%s): it POPS, so the doc\'s own Back reaches the Letters list', async (isPublicDoc) => {
    mount({
      grandparent: '/letters', parentPath: '/letters/drafts/doc-1', parentRoute: '/letters/drafts/:docId', parentFallback: '/letters',
      childPath: '/letter/doc-1/compose', childRoute: '/letter/:docId/compose', child: seal(isPublicDoc, true),
    });
    await openChild();
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to Doc' })[0] as HTMLElement);
    await expectParentBackReachesGrandparent();
  });

  it.each([[false], [true]])('opened from the Drafts list (isPublicDoc=%s): popping would land on the LIST, so it goes to the doc (replace)', async (isPublicDoc) => {
    // drafts-tab navigates straight to compose: the entry below is the list, not the doc.
    const Doc = () => (<><FocusHeader fallback="/letters" /><Page name="doc" /></>);
    render(
      <MemoryRouter initialEntries={['/letters', '/letter/doc-1/compose']} initialIndex={1}>
        <Routes>
          <Route path="/letters" element={<Page name="list" />} />
          <Route path="/letters/drafts/:docId" element={<Doc />} />
          <Route path="/letter/:docId/compose" element={<>{seal(isPublicDoc, false)}</>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Back to Doc' })[0] as HTMLElement);
    await waitFor(() => expect(page()).toBe('doc'));
    // The compose entry was replaced by the doc: the doc's Back reaches the list, not compose.
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(page()).toBe('list'));
  });
});

// ── event -> Edit -> back to the event ───────────────────────────────────────────────────────────
describe('event -> Edit: Back, Cancel and Save return the way they came', () => {
  const event = {
    id: 'ev-1', slug: 'night', title: 'Night', description: 'A long enough description for the form.', datetime: '2099-01-01T11:00:00Z', timezone: 'Asia/Bangkok',
    durationMinutes: 60, location: 'Somewhere', hostId: 'host-1', hasGroupChat: false, preparationEnabled: false, statementTag: null,
  };
  const opts = (): ScenarioOpts => ({
    grandparent: '/events/list', parentPath: '/events/night', parentRoute: '/events/:slug', parentFallback: '/events',
    childPath: '/events/night/edit', childRoute: '/events/:slug/edit', child: <EditEvent />,
  });

  beforeEach(() => {
    auth.value = { user: { id: 'host-1' }, session: { user: { id: 'host-1' } }, isLoading: false, sessionChecked: true };
    eventsSvc.getEventBySlug.mockResolvedValue(event);
    eventsSvc.getEventGroupChatUrl.mockResolvedValue(null);
    eventsSvc.updateEvent.mockResolvedValue(true);
  });

  it('Cancel', async () => {
    mount(opts());
    await openChild();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await expectParentBackReachesGrandparent();
  });

  it('Save', async () => {
    mount(opts());
    await openChild();
    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }));
    await expectParentBackReachesGrandparent();
  });

  it("the page's own Back", async () => {
    mount(opts());
    await openChild();
    await screen.findByRole('button', { name: 'Save Changes' });
    const backs = screen.getAllByRole('button', { name: /^(Go back|Back to Event)/ });
    fireEvent.click(backs[backs.length - 1] as HTMLElement);
    await expectParentBackReachesGrandparent();
  });
});

// ── event -> RSVP confirm -> back to the event ───────────────────────────────────────────────────
describe('event -> RSVP confirm: the return pops only when the event page opened it, else replaces', () => {
  const event = {
    id: 'ev-1', slug: 'night', title: 'Night', description: 'd', datetime: '2099-01-01T11:00:00Z', timezone: 'Asia/Bangkok',
    durationMinutes: 60, location: 'Somewhere', hostId: 'host-1', hostName: 'H', hasGroupChat: false, preparationEnabled: false, attendees: [],
  };
  const opts = (): ScenarioOpts => ({
    grandparent: '/events/list', parentPath: '/events/night', parentRoute: '/events/:slug', parentFallback: '/events',
    childPath: '/events/night/confirm', childRoute: '/events/:slug/confirm', child: <RsvpConfirm />,
    linkState: { fromEvent: true },
  });

  beforeEach(() => {
    eventsSvc.getEventBySlug.mockResolvedValue(event);
    eventsSvc.getEventGroupChatUrl.mockResolvedValue(null);
  });

  function catchTimer() {
    const queued: Array<() => void> = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms === 10000) { queued.push(fn); return 0 as unknown as ReturnType<typeof setTimeout>; }
      return realSetTimeout(fn, ms, ...rest);
    }) as typeof setTimeout);
    return queued;
  }

  it('the 10-second return, opened by the event page', async () => {
    const queued = catchTimer();
    mount(opts());
    await openChild();
    await waitFor(() => expect(queued.length).toBeGreaterThan(0));
    act(() => { queued.forEach(f => f()); });
    await expectParentBackReachesGrandparent();
  });

  it('the visible link back to the event, opened by the event page', async () => {
    mount(opts());
    await openChild();
    fireEvent.click(await screen.findByRole('link', { name: /View Event Details/ }));
    await expectParentBackReachesGrandparent();
  });

  it('arriving after sign-up (the entry below is /signup): the return REPLACES with the event and never pops out of the app', async () => {
    const queued = catchTimer();
    render(
      <MemoryRouter initialEntries={['/signup', '/events/night/confirm']} initialIndex={1}>
        <Routes>
          <Route path="/signup" element={<Page name="signup" />} />
          <Route path="/events/:slug" element={<Page name="event" />} />
          <Route path="/events/:slug/confirm" element={<RsvpConfirm />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(queued.length).toBeGreaterThan(0));
    act(() => { queued.forEach(f => f()); });
    await waitFor(() => expect(page()).toBe('event'));
  });

  it('the same for the link: with no marker it replaces with the event', async () => {
    render(
      <MemoryRouter initialEntries={['/signup', '/events/night/confirm']} initialIndex={1}>
        <Routes>
          <Route path="/signup" element={<Page name="signup" />} />
          <Route path="/events/:slug" element={<Page name="event" />} />
          <Route path="/events/:slug/confirm" element={<RsvpConfirm />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('link', { name: /View Event Details/ }));
    await waitFor(() => expect(page()).toBe('event'));
  });
});

// ── event -> room pages: Ready, Host, Close, Prepare ─────────────────────────────────────────────
describe('event -> Ready / Host / Close / Prepare: the way back to the event does not loop', () => {
  const event = {
    id: 'ev-1', slug: 'night', title: 'Night', description: 'd', datetime: '2099-01-01T11:00:00Z', timezone: 'Asia/Bangkok',
    durationMinutes: 60, location: 'Somewhere', hostId: 'host-1', hostName: 'H', hasGroupChat: false, preparationEnabled: true,
    statementTag: null, researchPlaces: 6, attendees: [],
  };
  const eventOpts = (childRoute: string, child: React.ReactNode): ScenarioOpts => ({
    grandparent: '/events/list', parentPath: '/events/night', parentRoute: '/events/:slug', parentFallback: '/events',
    childPath: childRoute, childRoute: childRoute.replace('night', ':slug'), child,
  });

  beforeEach(() => {
    auth.value = { user: { id: 'host-1' }, session: { user: { id: 'host-1' } }, isLoading: false, sessionChecked: true };
    room.access = { slug: 'night', event, loading: false, granted: true, isLoggedIn: true, offline: false };
    eventsSvc.getEventBySlug.mockResolvedValue(event);
    eventsSvc.isUserRsvpd.mockResolvedValue(true);
    eventsSvc.getUpcomingEvents.mockResolvedValue([]);
    eventsSvc.getEventAttendees.mockResolvedValue([]);
    eventsSvc.getEventGroupChatUrl.mockResolvedValue(null);
    closeSvc.close = { isAttendee: true, score: null, liked: null, improve: null, quoteOk: null, asks: [], finished: false };
    prepState.value = {
      loading: false, error: false, parts: [], cmp7Points: [], eventPoints: [], proof: null, plan: [], progress: { done: 0, total: 0 },
      withPrincipleIntro: false, cards: { cmp7: 0, stake: 0 }, minutes: 0,
      prep: { eventId: 'ev-1', profileId: 'host-1', prepChoice: 'now', currentStep: null, stepsDone: [], startedAt: '2099-01-01', completedAt: '2099-01-02',
        optedIn: null, principleRating: null, researchState: null, micSetup: null, researchConsentedAt: null, researchPolicyVersion: null },
      reload: vi.fn(), setPrep: vi.fn(), setParts: vi.fn(), reloadPoints: vi.fn(),
    };
    prepState.fresh = null;
  });

  it('Ready: its Back pops to the event (and the event\'s own Back then reaches the list)', async () => {
    mount(eventOpts('/events/night/ready', <EventRoomReady />));
    await openChild();
    fireEvent.click(await screen.findByTestId('room-back'));
    await expectParentBackReachesGrandparent();
  });

  it('Host: its Back pops to the event', async () => {
    mount(eventOpts('/events/night/host', <EventHostPage />));
    await openChild();
    const backs = await screen.findAllByRole('button', { name: /^(Go back|Back to the event)$/ });
    fireEvent.click(backs[backs.length - 1] as HTMLElement);
    await expectParentBackReachesGrandparent();
  });

  it('Close: the intro\'s Back pops to the event', async () => {
    mount(eventOpts('/events/night/close', <EventClosePage />));
    await openChild();
    fireEvent.click(await screen.findByTestId('header-back'));
    await expectParentBackReachesGrandparent();
  });

  it('Close, a cold arrival (the QR code: /close is the only entry): Back goes to the event instead of leaving the app', async () => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    render(
      <MemoryRouter initialEntries={['/events/night/close']}>
        <Routes>
          <Route path="/events/:slug" element={<Page name="event" />} />
          <Route path="/events/:slug/close" element={<EventClosePage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByTestId('header-back'));
    await waitFor(() => expect(page()).toBe('event'));
  });

  it('Prepare, end screen, opened BY THE EVENT PAGE (its banner marks the state): "Back to the event" pops, so the event\'s Back reaches the list', async () => {
    mount({ ...eventOpts('/events/night/prepare', <EventPrepPage />), linkState: { fromEvent: true } });
    await openChild();
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the event' }));
    await expectParentBackReachesGrandparent();
  });

  it('Prepare, end screen, with NO marker (the room, an email link): "Back to the event" replaces with the event, never popping elsewhere', async () => {
    // [list, room-ish page, prepare]: the entry below is not the event page.
    render(
      <MemoryRouter initialEntries={['/events/list', '/events/night/meet', '/events/night/prepare']} initialIndex={2}>
        <Routes>
          <Route path="/events/list" element={<Page name="grandparent" />} />
          <Route path="/events/:slug/meet" element={<Page name="meet" />} />
          <Route path="/events/:slug" element={<><FocusHeader fallback="/events" /><Page name="event" /></>} />
          <Route path="/events/:slug/prepare" element={<EventPrepPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the event' }));
    await waitFor(() => expect(page()).toBe('event'));
    // The prepare entry became the event: its Back goes down the stack (to meet), not into prepare again.
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    await waitFor(() => expect(page()).toBe('meet'));
  });
});

// ── RSVP confirm -> Prepare now -> Back to the event ─────────────────────────────────────────────
describe('RSVP confirm -> prepare -> "Back to the event": the label is true, it lands on the event', () => {
  const event = {
    id: 'ev-1', slug: 'night', title: 'Night', description: 'd', datetime: '2099-01-01T11:00:00Z', timezone: 'Asia/Bangkok',
    durationMinutes: 60, location: 'Somewhere', hostId: 'host-1', hostName: 'H', hasGroupChat: false, preparationEnabled: true,
    statementTag: null, researchPlaces: 6, attendees: [],
  };
  const completed = {
    loading: false, error: false, parts: [], cmp7Points: [], eventPoints: [], proof: null, plan: [], progress: { done: 0, total: 0, complete: true },
    withPrincipleIntro: false, cards: { cmp7: 0, stake: 0 }, minutes: 0,
    prep: { eventId: 'ev-1', profileId: 'u1', prepChoice: 'now', currentStep: null, stepsDone: [], startedAt: '2099-01-01', completedAt: '2099-01-02',
      optedIn: null, principleRating: null, researchState: null, micSetup: null, researchConsentedAt: null, researchPolicyVersion: null },
    reload: vi.fn(), setPrep: vi.fn(), setParts: vi.fn(), reloadPoints: vi.fn(),
  };

  beforeEach(() => {
    auth.value = { user: { id: 'u1' }, session: { user: { id: 'u1' } }, isLoading: false, sessionChecked: true };
    eventsSvc.getEventBySlug.mockResolvedValue(event);
    eventsSvc.isUserRsvpd.mockResolvedValue(true);
    eventsSvc.getEventGroupChatUrl.mockResolvedValue(null);
    prepState.value = completed;
    prepState.fresh = { ...completed, progress: { done: 0, total: 3, complete: false }, minutes: 5, prep: null };
  });

  it('after Prepare now from the confirm screen, "Back to the event" ends on the event page (not on the confirm page)', async () => {
    const seen: string[] = [];
    function Where() {
      const loc = useLocation();
      seen.push(loc.pathname);
      return <p data-testid="where">{loc.pathname}</p>;
    }
    const EventStub = () => (
      <>
        <FocusHeader fallback="/events" />
        <Page name="event" />
        <Link to="/events/night/confirm" state={{ fromEvent: true }}>reserve</Link>
      </>
    );
    render(
      <MemoryRouter initialEntries={['/events/list', '/events/night']} initialIndex={1}>
        <Where />
        <Routes>
          <Route path="/events/list" element={<Page name="grandparent" />} />
          <Route path="/events/:slug" element={<EventStub />} />
          <Route path="/events/:slug/confirm" element={<RsvpConfirm />} />
          <Route path="/events/:slug/prepare" element={<EventPrepPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('reserve'));
    fireEvent.click(await screen.findByRole('button', { name: 'Prepare now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Back to the event' }));
    // The label is true: the event page, not the confirm screen that is below prepare in history.
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/events/night'));
    expect(page()).toBe('event');
    // And the prepare page is gone from the stack: walking Back never shows it again.
    const afterLanding = seen.length;
    for (let i = 0; i < 4 && screen.queryByTestId('page')?.textContent !== 'grandparent'; i++) {
      const back = screen.queryByRole('button', { name: /^(Go back|Back to .+)$/ });
      if (!back) break;
      fireEvent.click(back);
      await new Promise(r => setTimeout(r, 20));
    }
    expect(seen.slice(afterLanding).some(p => p.endsWith('/prepare'))).toBe(false);
  });
});
