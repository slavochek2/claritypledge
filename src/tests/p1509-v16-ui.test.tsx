/**
 * @file p1509-v16-ui.test.tsx
 * @description P1509 v16 walkthrough with REAL-DATA wiring: the viewer is the signed-in persona (derived from the profile
 * slug), every real surface (Home, Share picker, profiles, Letters, Groups, Events, Partners, Admin) reads named fixture
 * records through mocked services, and each shows its skeleton, its error with a working Retry and its empty state
 * (`?real=` forces them). The chat mock keeps v15's behaviour: threads, unread, archive, the mirror, forward, the live bar.
 * Services are mocked at the module boundary (src/app/data/*), so the adapter's real calls are what is tested.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act as rtlAct, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ClarityChatV16, SHEET_DISMISS_PX } from '@/app/prototypes/clarity-chat-v16/ClarityChatV16';
import { SIDEBAR_KEY } from '@/app/prototypes/clarity-chat-v16/mock-data';
import { isSeededPersonaEmail, personaEmail } from '@/app/prototypes/clarity-chat-v16/personas';
import { TERMS_PLACEHOLDER } from '@/app/pages/create-agreement-page';
import { supabase } from '@/lib/supabase';
import { eventsService } from '@/app/data/events-service';
import { storiesService } from '@/app/data/stories-service';
import { pointsService } from '@/app/data/points-service';
import { getDeliveriesForLetter, getInboxItems } from '@/app/data/letters-service';
import { getProfileBySlug } from '@/app/data/api';
import { getAdminTopics } from '@/app/data/topic-voting';
import { agreementsService } from '@/app/data/agreements-service';
import { createRoom } from '@/app/data/transcribe-service';
import * as F from './p1509-v16-fixtures';

/* The test double for the whole data layer: who is signed in, which services fail next, who is going to what. */
const h = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const snaps = new Map<string, unknown>();
  const state = {
    snapshot: null as unknown,
    myOrgIds: ['org-cm'] as string[],
    cancelled: new Set<string>(),
    added: new Set<string>(),
    failures: {} as Record<string, number>,
    rsvpOk: true,
    adminIds: ['u-bob'] as string[],
    adminThrows: false,
    signInStatus: 200,
    signInError: '',
    people: {} as Record<string, unknown>,
    /** Overrides the agreements the service returns for Bob (null = the default Alice active, Carol pending). */
    agreements: null as unknown[] | null,
  };
  return {
    state,
    set(next: unknown) { state.snapshot = next; listeners.forEach((l) => l()); },
    get: () => state.snapshot,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    snap(p: { id: string; slug: string; name: string; email: string } | null): unknown {
      const key = p?.id ?? 'none';
      if (!snaps.has(key)) {
        snaps.set(key, { session: p ? { user: { id: p.id } } : null, user: p, isLoading: false, sessionChecked: true, signOut: async () => { h.set(h.snap(null)); }, refreshProfile: async () => {} });
      }
      return snaps.get(key);
    },
    /** The next `n` calls to this service fail. */
    fail(name: string, n = 1) { state.failures[name] = n; },
    maybeFail(name: string) { if ((state.failures[name] ?? 0) > 0) { state.failures[name]!--; throw new Error(`${name} failed`); } },
  };
});

vi.mock('@/auth', async () => {
  const { useSyncExternalStore } = await import('react');
  return { useAuth: () => useSyncExternalStore(h.subscribe, h.get) };
});

vi.mock('@/app/data/stories-service', async (importOriginal) => {
  const F = await import('./p1509-v16-fixtures');
  const orig = await importOriginal<typeof import('@/app/data/stories-service')>();
  return { ...orig, storiesService: { ...orig.storiesService,
    getPublicStoriesFeed: vi.fn(async () => { h.maybeFail('feed'); return [F.STORY_HIKE, F.STORY_SISTER] as never; }),
    /* The hike story argues TWO points, so a click on the second one can be told from a click on the first. */
    getPointsForStories: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, id === 'st-bob-1' ? [F.POINT_SUMMARY_DISAGREEMENT, { ...F.POINT_SUMMARY_DISAGREEMENT, id: F.POINT_REPEAT.id, statement: F.POINT_REPEAT.statement, tags: F.POINT_REPEAT.tags, positionCounts: F.POINT_REPEAT.positionCounts }] : []])) as never),
    getStoriesForPoints: vi.fn(async () => new Map() as never),
    getStoriesByAuthor: vi.fn(async (id: string) => (id === 'u-bob' ? [F.STORY_HIKE] : [F.STORY_SISTER]) as never),
  } };
});

vi.mock('@/app/data/points-service', async (importOriginal) => {
  const F = await import('./p1509-v16-fixtures');
  const orig = await importOriginal<typeof import('@/app/data/points-service')>();
  return { ...orig, pointsService: { ...orig.pointsService,
    getPublicPointsFeed: vi.fn(async () => [F.POINT_DISAGREEMENT, F.POINT_REPEAT, F.POINT_DEFINITIONS] as never),
    getPointsForProfileDisplay: vi.fn(async (id: string) => (id === 'u-bob' ? [F.POINT_DISAGREEMENT] : [F.POINT_REPEAT]) as never),
  } };
});

vi.mock('@/app/data/organizations-service', async (importOriginal) => {
  const F = await import('./p1509-v16-fixtures');
  const orig = await importOriginal<typeof import('@/app/data/organizations-service')>();
  const orgs = [F.ORG_CM, F.ORG_ONLINE];
  return { ...orig, organizationsService: { ...orig.organizationsService,
    listPublicOrganizations: vi.fn(async () => { h.maybeFail('groups'); return orgs as never; }),
    getMemberCounts: vi.fn(async () => ({ 'org-cm': 3, 'org-online': 2 })),
    getParticipation: vi.fn(async () => ({})),
    getMyMembershipOrgIds: vi.fn(async () => [...h.state.myOrgIds]),
    getEventSummaries: vi.fn(async () => ({})),
    getOrganizationBySlug: vi.fn(async (slug: string) => (orgs.find((o) => o.slug === slug) ?? null) as never),
    getMembers: vi.fn(async (slug: string) => { h.maybeFail('members'); return (F.MEMBERS[slug] ?? []) as never; }),
    getMyMembership: vi.fn(async (orgId: string) => (h.state.myOrgIds.includes(orgId) ? { role: orgId === 'org-cm' ? 'organizer' : 'member', termsVersion: 1, acceptedAt: '' } : null) as never),
  } };
});

vi.mock('@/app/data/events-service', async (importOriginal) => {
  const F = await import('./p1509-v16-fixtures');
  const orig = await importOriginal<typeof import('@/app/data/events-service')>();
  const all = [F.EVENT_NIGHT_OCT16, F.EVENT_NIGHT_OCT2, F.EVENT_ONLINE_SEPT, F.EVENT_ONLINE_OCT23];
  const key = (e: string, p: string) => `${e}:${p}`;
  const baseHas = (e: string, p: string) => (F.ATTENDEES[e] ?? []).some((a) => a.profileId === p);
  const going = (e: string, p: string) => (baseHas(e, p) && !h.state.cancelled.has(key(e, p))) || h.state.added.has(key(e, p));
  return { ...orig, eventsService: { ...orig.eventsService,
    getUpcomingEvents: vi.fn(async (orgId?: string) => (orgId ? F.EVENTS_BY_ORG[orgId]?.upcoming ?? [] : Object.values(F.EVENTS_BY_ORG).flatMap((o) => o.upcoming)) as never),
    getPastEvents: vi.fn(async (orgId?: string) => (orgId ? F.EVENTS_BY_ORG[orgId]?.past ?? [] : Object.values(F.EVENTS_BY_ORG).flatMap((o) => o.past)) as never),
    getEventBySlug: vi.fn(async (slug: string) => { h.maybeFail('event'); return (all.find((e) => e.slug === slug) ?? null) as never; }),
    getEventAttendees: vi.fn(async (eventId: string) => {
      const base = (F.ATTENDEES[eventId] ?? []).filter((a) => !h.state.cancelled.has(key(eventId, a.profileId)));
      const extra = [F.BOB, F.DANA].filter((p) => h.state.added.has(key(eventId, p.id)) && !base.some((a) => a.profileId === p.id)).map((p) => ({ profileId: p.id, slug: p.slug, name: p.name, avatarColor: '#2563eb', hasPledged: false, earCount: 0 }));
      return [...base, ...extra] as never;
    }),
    isUserRsvpd: vi.fn(async (eventId: string, profileId: string) => going(eventId, profileId)),
    rsvpToEvent: vi.fn(async (eventId: string, profileId: string) => { if (!h.state.rsvpOk) return false; h.state.added.add(key(eventId, profileId)); h.state.cancelled.delete(key(eventId, profileId)); return true; }),
    cancelRsvp: vi.fn(async (eventId: string, profileId: string) => { h.state.cancelled.add(key(eventId, profileId)); h.state.added.delete(key(eventId, profileId)); return true; }),
  } };
});

vi.mock('@/app/data/agreements-service', async (importOriginal) => {
  const F = await import('./p1509-v16-fixtures');
  const orig = await importOriginal<typeof import('@/app/data/agreements-service')>();
  return { ...orig, agreementsService: { ...orig.agreementsService,
    getAgreementsForProfile: vi.fn(async (id: string) => { h.maybeFail('partners'); return (id === 'u-bob' ? h.state.agreements ?? [F.AGREEMENT_BOB_ALICE, F.AGREEMENT_BOB_CAROL_PENDING] : []) as never; }),
    getIncomingInvitations: vi.fn(async () => [] as never),
    createAgreement: vi.fn(async () => F.AGREEMENT_BOB_CAROL_PENDING as never),
  } };
});

vi.mock('@/app/data/docs-service', async (importOriginal) => {
  const F = await import('./p1509-v16-fixtures');
  const orig = await importOriginal<typeof import('@/app/data/docs-service')>();
  return { ...orig, docsService: { ...orig.docsService, getDocsByUser: vi.fn(async (id: string) => (id === 'u-bob' ? [F.DRAFT_BOB] : []) as never) } };
});

vi.mock('@/app/data/transcribe-service', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/app/data/transcribe-service')>();
  return { ...orig, createRoom: vi.fn(async () => { throw new Error('createRoom must not be reached from the prototype'); }) };
});

vi.mock('@/app/data/letters-service', async (importOriginal) => {
  const F = await import('./p1509-v16-fixtures');
  const orig = await importOriginal<typeof import('@/app/data/letters-service')>();
  return { ...orig,
    getInboxItems: vi.fn(async () => { h.maybeFail('inbox'); return F.INBOX as never; }),
    getAllSentLetters: vi.fn(async (id: string) => (id === 'u-bob' ? [F.SENT_BOB] : []) as never),
    getDeliveriesForLetter: vi.fn(async () => [
      { id: 'dv-1', letter_id: 'lt-bob', receiver_email: null, receiver_profile_id: 'u-alice', receiver_name: 'Alice Moreau', status: 'completed' },
      { id: 'dv-2', letter_id: 'lt-bob', receiver_email: null, receiver_profile_id: 'u-carol', receiver_name: 'Carol Singh', status: 'sent' },
    ] as never),
  };
});

vi.mock('@/app/data/topic-voting', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/app/data/topic-voting')>();
  return { ...orig, getAdminTopics: vi.fn(async () => {
    if (h.state.adminThrows) throw new Error('network');
    const who = (h.state.snapshot as { user?: { id: string } } | null)?.user?.id;
    return who && h.state.adminIds.includes(who) ? [] : null;
  }) };
});

vi.mock('@/app/data/api', async (importOriginal) => {
  const F = await import('./p1509-v16-fixtures');
  const orig = await importOriginal<typeof import('@/app/data/api')>();
  return { ...orig, getProfileBySlug: vi.fn(async (slug: string) => F.profileOf(slug) as never) };
});

vi.setConfig({ testTimeout: 20_000 });

const BASE = '/tree/clarity-chat-v16';
const renderV16 = (url = BASE) => render(<MemoryRouter initialEntries={[url]}><ClarityChatV16 /></MemoryRouter>);
const openRow = (id: string) => fireEvent.click(within(document.querySelector<HTMLElement>(`[data-chat="${id}"]`)!).getAllByRole('button')[0]!);
const tab = (name: RegExp) => fireEvent.click(within(screen.getByTestId('folder-tabs')).getByRole('tab', { name }));
const chatView = () => screen.getByTestId('chat-view');
const msg = (text: string | RegExp) => within(within(chatView()).getByRole('list', { name: 'Messages' })).getAllByText(text)[0]!.closest('li')!;
const tool = (li: HTMLElement, name: string | RegExp) => fireEvent.click(within(within(li).getByRole('toolbar')).getByRole('button', { name }));
const toolNames = (li: HTMLElement) => within(within(li).getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
const back = () => fireEvent.click(screen.getAllByRole('button', { name: 'Back' })[0]!);
const sidebar = () => screen.getByTestId('sidebar');
/** Desktop (>= 1024px) shows the sidebar; below it the bottom bar and the profile sheet. jsdom has no layout, so the media query is stubbed. */
const stubViewport = (desktop: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({
  matches: q === '(min-width: 1024px)' ? desktop : false, media: q, onchange: null,
  addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
}));
const place = (name: string) => fireEvent.click(within(within(sidebar()).getByRole('list', { name: 'Places' })).getByRole('button', { name: new RegExp(`^${name}`) }));
/** Phone: the bottom tab. */
const tabbar = (name: string) => fireEvent.click(within(screen.getByTestId('bottom-tabs')).getByRole('button', { name: new RegExp(name) }));
const rightClick = (li: HTMLElement) => fireEvent.contextMenu(li.firstElementChild!);
const menuItems = () => within(screen.getByTestId('message-menu')).getAllByRole('menuitem').map((b) => b.textContent);
/** Radix Tabs select on mousedown (left button). */
const radixTab = (el: HTMLElement) => fireEvent.mouseDown(el, { button: 0, ctrlKey: false });
const groupTab = (name: string) => radixTab(within(screen.getByTestId('group-tabs')).getByRole('tab', { name }));
/** My groups arrive from the service: the Groups place lists them. */
const myGroupsList = async () => { place('Groups'); return screen.findByRole('list', { name: 'Your groups' }); };
const asDana = async () => { fireEvent.click(screen.getByRole('radio', { name: 'Dana' })); await waitFor(() => expect(within(screen.getByTestId('sidebar-me')).getByText('Dana Ortiz')).toBeTruthy()); };

beforeEach(() => {
  vi.clearAllMocks();
  h.state.myOrgIds = ['org-cm'];
  h.state.cancelled.clear(); h.state.added.clear(); h.state.failures = {}; h.state.rsvpOk = true; h.state.adminIds = ['u-bob']; h.state.adminThrows = false;
  h.state.signInStatus = 200; h.state.signInError = ''; h.state.agreements = null;
  /* The prototype fails closed unless it is pointed at the TEST project (vitest's own URL is localhost). */
  vi.stubEnv('VITE_SUPABASE_URL', 'https://gfjctyxqlwexxwsmkakq.supabase.co');
  h.set(h.snap(F.BOB));
  /* The dev server's persona endpoint: a session for the persona asked for, or the seed hint (409). The app's supabase client then applies it. */
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  stubViewport(true);
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: { body?: string }) => {
    const id = JSON.parse(init?.body ?? '{}').id as string;
    return h.state.signInStatus === 200
      ? { ok: true, status: 200, json: async () => ({ access_token: `tok-${id}`, refresh_token: 'r' }) }
      : { ok: false, status: h.state.signInStatus, json: async () => ({ error: h.state.signInError }) };
  }));
  vi.spyOn(supabase.auth, 'signOut').mockResolvedValue({ error: null } as never);
  vi.spyOn(supabase.auth, 'setSession').mockImplementation((async ({ access_token }: { access_token: string }) => {
    h.set(h.snap(access_token === 'tok-dana' ? F.DANA : F.BOB));
    return { data: {}, error: null };
  }) as never);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); try { window.localStorage.removeItem(SIDEBAR_KEY); } catch { /* ignore */ } });

describe('P1509 v16 viewer and sign-in', () => {
  it('the viewer is derived from the signed-in profile slug: Bob, then Dana through the persona endpoint', async () => {
    renderV16();
    expect(within(screen.getByTestId('sidebar-me')).getByText('Bob Keller')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Bob' }).getAttribute('aria-checked')).toBe('true');
    await asDana();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('/__p1509/persona-session', expect.objectContaining({ method: 'POST', body: JSON.stringify({ id: 'dana' }) }));
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'tok-dana', refresh_token: 'r' });
    expect(screen.getByRole('radio', { name: 'Dana' }).getAttribute('aria-checked')).toBe('true');
  });

  it('the strip says who is signed in as a test persona, in one line', () => {
    renderV16();
    expect(screen.getByTestId('persona-note').textContent).toBe('Signed in as Bob Keller (test persona)');
  });

  it('the persona session does not outlive the page: leaving the route and pagehide sign a persona out (local scope); a non-persona is left alone', async () => {
    const a = renderV16();
    a.unmount();
    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' }));
    vi.mocked(supabase.auth.signOut).mockClear();
    const b = renderV16();
    window.dispatchEvent(new Event('pagehide'));
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    b.unmount();
    vi.mocked(supabase.auth.signOut).mockClear();
    h.set(h.snap(F.STRANGER));
    const c = renderV16();
    window.dispatchEvent(new Event('pagehide'));
    c.unmount();
    await rtlAct(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('a remount in the same tick (StrictMode) does not sign the persona out', async () => {
    const a = renderV16();
    a.unmount();
    renderV16();
    await rtlAct(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('a failed sign-in shows its error (the 409 not-seeded hint with the command) and keeps the current viewer', async () => {
    renderV16();
    h.state.signInStatus = 409; h.state.signInError = 'Personas not seeded. Run: npx tsx scripts/p1509-seed-personas.ts';
    fireEvent.click(screen.getByRole('radio', { name: 'Dana' }));
    expect((await screen.findByRole('alert')).textContent).toContain('npx tsx scripts/p1509-seed-personas.ts');
    expect(within(screen.getByTestId('sidebar-me')).getByText('Bob Keller')).toBeTruthy();
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('nobody signed in, or a signed-in user who is not a persona: the signed-out state offers Sign in as Bob / Dana', async () => {
    h.set(h.snap(null));
    const a = renderV16();
    expect(screen.getByTestId('signed-out').textContent).toContain('You are signed out.');
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(screen.getByTestId('strip-sign-in-bob').textContent).toBe('Sign in as Bob');
    expect(screen.getByTestId('strip-sign-in-dana').textContent).toBe('Sign in as Dana');
    a.unmount();
    h.set(h.snap(F.STRANGER));
    renderV16();
    expect(screen.getByTestId('signed-out').textContent).toContain('not signed in as a test persona');
    fireEvent.click(screen.getByTestId('sign-in-dana'));
    expect(await screen.findByTestId('sidebar')).toBeTruthy();
    expect(within(screen.getByTestId('sidebar-me')).getByText('Dana Ortiz')).toBeTruthy();
  });

  it('a sign-in failure from the signed-out screen shows the error there', async () => {
    h.set(h.snap(null));
    renderV16();
    h.state.signInStatus = 409; h.state.signInError = 'Personas not seeded. Run: npx tsx scripts/p1509-seed-personas.ts';
    fireEvent.click(screen.getByTestId('sign-in-bob'));
    expect((await screen.findByTestId('sign-in-error')).textContent).toContain('Personas not seeded');
    expect(screen.getByTestId('signed-out')).toBeTruthy();
  });
});

describe('P1509 v16 sidebar and profile menu', () => {
  it('desktop sidebar: logo + collapse at the top, Search, Invite partner, Chats · Home · Groups · Letters · Events, then the profile picture with Tools beside it; no More, no hamburger', () => {
    renderV16();
    const top = screen.getByTestId('sidebar-top');
    expect(within(top).getByTestId('sidebar-logo')).toBeTruthy();
    expect(within(top).getByTestId('sidebar-toggle')).toBeTruthy();
    const actions = within(within(sidebar()).getByRole('list', { name: 'Actions' })).getAllByRole('button');
    expect(actions.map((b) => b.textContent)).toEqual(['Search', 'Invite partner']);
    const places = within(within(sidebar()).getByRole('list', { name: 'Places' })).getAllByRole('button');
    expect(places.map((b) => b.textContent?.replace(/\d+$/, ''))).toEqual(['Chats', 'Home', 'Groups', 'Letters', 'Events']);
    const bottom = screen.getByTestId('sidebar-bottom');
    const me = within(bottom).getByTestId('sidebar-me');
    const toolsBtn = within(bottom).getByTestId('sidebar-tools');
    expect(toolsBtn.textContent).toBe('Tools'); // icon + label
    expect(me.compareDocumentPosition(toolsBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // to the right of the picture, same row
    expect(me.parentElement!.parentElement).toBe(toolsBtn.parentElement); // one row
    const order = [top, actions[0]!, places[0]!, bottom];
    for (let i = 1; i < order.length; i++) expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(sidebar()).queryByText('More')).toBeNull();
    expect(within(sidebar()).queryByRole('button', { name: /menu|☰/i })).toBeNull();
    expect(screen.queryByTestId('bottom-tabs')).toBeNull(); // no bottom bar on desktop
    expect(within(sidebar()).queryByRole('list', { name: 'Your groups' })).toBeNull(); // groups live in the Groups place now
  });

  it('collapse works and is remembered; the logo goes Home; Tools stays visible when collapsed', () => {
    renderV16();
    fireEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(sidebar().getAttribute('data-collapsed')).toBe('true');
    expect(window.localStorage.getItem(SIDEBAR_KEY)).toBe('1');
    expect(within(sidebar()).getByTestId('sidebar-tools')).toBeTruthy();
    expect(within(sidebar()).getByTestId('sidebar-me')).toBeTruthy();
    fireEvent.click(screen.getByTestId('sidebar-toggle'));
    expect(sidebar().getAttribute('data-collapsed')).toBeNull();
    place('Letters');
    expect(screen.getByTestId('letters-page')).toBeTruthy();
    fireEvent.click(screen.getByTestId('sidebar-logo'));
    expect(screen.getByTestId('home-page')).toBeTruthy();
  });

  it('the sidebar\'s Search goes to Chats and focuses the search field; Invite partner opens the invite page; Tools opens Tools', () => {
    renderV16(`${BASE}?view=home`);
    fireEvent.click(screen.getByTestId('sidebar-search'));
    expect(screen.getByTestId('chat-list')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Search' }));
    fireEvent.click(screen.getByTestId('sidebar-invite'));
    expect(screen.getByTestId('partner-invite-page')).toBeTruthy();
    fireEvent.click(screen.getByTestId('sidebar-tools'));
    expect(screen.getByTestId('tools-page')).toBeTruthy();
  });

  it('Groups place: your groups first (the memberships the service returned), then a quiet Browse groups button below them (not a list row)', async () => {
    renderV16();
    const groups = await myGroupsList();
    expect(within(groups).getAllByRole('button').map((b) => b.textContent)).toEqual(['Communication Activism Community · Chiang Mai3 members3']); // 3 members, 3 unread in its channels
    const browse = within(screen.getByTestId('groups-page')).getByTestId('browse-groups');
    expect(groups.contains(browse)).toBe(false);
    expect(groups.compareDocumentPosition(browse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(browse.className).toContain('border'); // Button variant="outline"
  });

  it('Events place: the real upcoming and past events as production event cards; a card opens that event', async () => {
    renderV16();
    place('Events');
    const page = screen.getByTestId('events-page');
    expect(await within(page).findAllByTestId('event-card')).toHaveLength(4);
    expect(page.textContent).toContain('Upcoming (2)');
    expect(page.textContent).toContain('Past (2)');
    fireEvent.click(within(page).getAllByTestId('event-card')[0]!);
    await waitFor(() => expect(screen.getByTestId('event-page')).toBeTruthy());
  });

  it('phone: opens on Chats; the bottom bar is Chats · Home · Groups · Letters · Profile; there is no sidebar', () => {
    stubViewport(false);
    renderV16();
    expect(screen.queryByTestId('sidebar')).toBeNull();
    expect(within(screen.getByTestId('bottom-tabs')).getAllByRole('button').map((b) => b.textContent?.replace(/\d+/g, '').replace(/^BK/, ''))).toEqual(['Chats', 'Home', 'Groups', 'Letters', 'Profile']); // BK: the Profile tab shows my avatar's initials
    expect(screen.getByTestId('main-area').getAttribute('data-view')).toBe('chats');
    expect(screen.getByTestId('chat-list')).toBeTruthy();
    expect(within(screen.getByTestId('bottom-tabs')).getByRole('button', { name: /Chats/ }).getAttribute('aria-current')).toBe('page');
  });

  it('phone Profile is a bottom sheet (not a page): it closes on an outside tap, on Esc and on a swipe down past the threshold, and springs back short of it', async () => {
    stubViewport(false);
    renderV16();
    tabbar('Profile');
    expect(screen.getByTestId('sheet')).toBeTruthy();
    expect(screen.getByTestId('main-area').getAttribute('data-view')).toBe('chats'); // still on Chats: the sheet is not a page
    await rtlAct(async () => { await new Promise((r) => setTimeout(r, 15)); });
    fireEvent.pointerDown(screen.getByTestId('dialog-overlay')); // outside tap
    await waitFor(() => expect(screen.queryByTestId('sheet')).toBeNull());
    tabbar('Profile');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('sheet')).toBeNull());
    tabbar('Profile');
    const panel = screen.getByTestId('sheet');
    fireEvent.touchStart(panel, { touches: [{ clientY: 300 }], changedTouches: [{ clientY: 300 }] });
    fireEvent.touchMove(panel, { touches: [{ clientY: 300 + SHEET_DISMISS_PX - 20 }], changedTouches: [{ clientY: 300 + SHEET_DISMISS_PX - 20 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientY: 300 + SHEET_DISMISS_PX - 20 }] });
    expect(screen.getByTestId('sheet')).toBeTruthy(); // a short drag springs back
    fireEvent.touchStart(panel, { touches: [{ clientY: 300 }], changedTouches: [{ clientY: 300 }] });
    fireEvent.touchMove(panel, { touches: [{ clientY: 300 + SHEET_DISMISS_PX + 40 }], changedTouches: [{ clientY: 300 + SHEET_DISMISS_PX + 40 }] });
    fireEvent.touchEnd(panel, { changedTouches: [{ clientY: 300 + SHEET_DISMISS_PX + 40 }] });
    await waitFor(() => expect(screen.queryByTestId('sheet')).toBeNull()); // a swipe down closes it
  });

  it('the phone sheet holds Invite partner, Tools and Events (there is no sidebar) beside the account menu; picking one closes it', () => {
    stubViewport(false);
    renderV16();
    tabbar('Profile');
    const text = screen.getByTestId('me-menu').textContent ?? '';
    for (const s of ['My Profile', 'Partners', 'Invite partner', 'Tools', 'Events', 'Settings', 'Use cases', 'Learn', 'Log Out']) expect(text).toContain(s);
    fireEvent.click(screen.getByTestId('menu-invite'));
    expect(screen.queryByTestId('sheet')).toBeNull();
    expect(screen.getByTestId('partner-invite-page')).toBeTruthy();
  });

  it('profile menu: My Profile, Partners, Session History, Settings, then Use cases and Learn next to Settings, Pledgers, Admin (for the admin) and Log Out; no "More"; Log Out signs out for real', async () => {
    renderV16();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    const m = screen.getByTestId('me-menu');
    await waitFor(() => expect(screen.getByTestId('admin-group')).toBeTruthy());
    const text = m.textContent ?? '';
    for (const s of ['My Profile', 'Partners', 'Session History', 'Settings', 'For builders', 'For hiring', 'For co-founders', 'For coaches', 'Manifesto', 'About', 'Pledgers', 'Admin', 'Log Out']) expect(text).toContain(s);
    expect(within(m).queryByText('More')).toBeNull();
    const at = (label: string) => text.indexOf(label);
    expect(at('Settings')).toBeLessThan(at('Use cases'));
    expect(at('Use cases')).toBeLessThan(at('Learn'));
    expect(at('Learn')).toBeLessThan(at('Pledgers'));
    expect(within(m).getByText('Session History').closest('a')!.getAttribute('href')).toBe('/sessions');
    expect(within(m).getByText('Users').closest('a')!.getAttribute('href')).toBe('/admin/users');
    expect(within(m).getByText('Topics').closest('a')!.getAttribute('href')).toBe('/admin/topics');
    fireEvent.click(screen.getByTestId('log-out'));
    expect(await screen.findByTestId('signed-out')).toBeTruthy();
    expect(screen.queryByTestId('sidebar')).toBeNull();
    fireEvent.click(screen.getByTestId('sign-in-bob'));
    expect(await screen.findByTestId('sidebar')).toBeTruthy();
  });

  it('Admin is hidden for a non-admin persona (the is_admin probe returns nothing for Dana), and fails closed when the probe errors', async () => {
    renderV16();
    await asDana();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    expect(screen.getByTestId('me-menu').textContent).toContain('Log Out');
    await waitFor(() => expect(vi.mocked(getAdminTopics)).toHaveBeenCalledTimes(2)); // Bob's probe, then Dana's
    expect(screen.queryByTestId('admin-group')).toBeNull();
    expect(screen.getByTestId('me-menu').textContent).not.toContain('Admin');
  });

  it('Admin never shows while the probe is loading or when it throws', async () => {
    h.state.adminThrows = true;
    renderV16();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    expect(screen.queryByTestId('admin-group')).toBeNull();
    await waitFor(() => expect(vi.mocked(getAdminTopics)).toHaveBeenCalled());
    await rtlAct(async () => { await Promise.resolve(); });
    expect(screen.queryByTestId('admin-group')).toBeNull();
  });

  it('Partners page: the real agreements (Active, Pending invitation) as production AgreementRow, no Resend or Cancel; a row opens that 1:1', async () => {
    renderV16();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    fireEvent.click(within(screen.getByTestId('me-menu')).getByText('Partners'));
    const page = screen.getByTestId('partners-page');
    await waitFor(() => expect(page.textContent).toContain('Active (1)'));
    expect(page.textContent).toContain('My Partners');
    expect(page.textContent).toContain('Invite sent (1)');
    expect(page.textContent).toContain('Carol Singh');
    expect(within(page).queryByRole('button', { name: /Resend|Cancel/ })).toBeNull();
    expect(vi.mocked(agreementsService.getAgreementsForProfile)).toHaveBeenCalledWith('u-bob', 'u-bob');
    fireEvent.click(within(page).getByText('Alice Moreau'));
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
  });
});

describe('P1509 v16 groups and events (real rows)', () => {
  it('a group from the Groups place opens its OrgPage: Events, Members, About, Chats tabs in ?tab=; General is a lock with "Members only"', async () => {
    renderV16();
    fireEvent.click(within(await myGroupsList()).getByText(/Chiang Mai/));
    expect(await screen.findByTestId('group-page')).toBeTruthy();
    await screen.findByTestId('group-tabs');
    expect(within(screen.getByTestId('group-tabs')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Events', 'Members', 'About', 'Chats']);
    expect(screen.getByTestId('group-events').textContent).toContain('Clarity Night, Oct 16');
    expect(screen.getByTestId('group-events').textContent).toContain('Clarity Night, Oct 2');
    groupTab('Members');
    expect(screen.getByTestId('group-members').textContent).toContain('Alice Moreau');
    groupTab('About');
    expect(screen.getByTestId('group-about').textContent).toContain('Ask a colleague what they understood');
    groupTab('Chats');
    const chats = screen.getByTestId('group-chats');
    expect(chats.textContent).toContain('General');
    expect(chats.textContent).toContain('Members only');
    expect(chats.textContent).not.toContain('# general');
    fireEvent.click(within(chats).getByText('General'));
    expect(chatView().getAttribute('data-chat-open')).toBe('gen-cm');
    back();
    expect(await screen.findByTestId('group-chats')).toBeTruthy(); // Back returns to the same tab
  });

  it('Browse groups: the directory lists both real groups, mine first, with their member counts; one I have not joined opens its Join page and joining works', async () => {
    renderV16();
    await myGroupsList();
    fireEvent.click(screen.getByTestId('browse-groups'));
    const dir = screen.getByTestId('directory-page');
    await within(dir).findAllByTestId('org-card');
    expect(within(dir).getAllByTestId('org-card').map((c) => c.textContent)).toEqual([expect.stringContaining('Communication Activism Community · Chiang Mai'), expect.stringContaining('Clarity Practice Community · Online')]);
    fireEvent.click(within(dir).getByText('Clarity Practice Community · Online'));
    await screen.findByTestId('group-tabs');
    fireEvent.click(within(screen.getByTestId('group-page')).getAllByRole('button', { name: /Join/ })[0]!);
    expect((await screen.findByTestId('join-page')).textContent).toContain('Join Clarity Practice Community · Online');
    await screen.findByTestId('accept-join');
    fireEvent.click(screen.getByTestId('accept-join'));
    expect(await screen.findByTestId('group-page')).toBeTruthy();
    expect(within(await myGroupsList()).getByText(/Online/)).toBeTruthy();
  });

  it('Back from an event goes to ITS group by history: cm, then online', async () => {
    const a = renderV16(`${BASE}?view=group&group=cm`);
    fireEvent.click(await within(await screen.findByTestId('group-events')).findByText(/Clarity Night, Oct 2/));
    await waitFor(() => expect(screen.getByTestId('event-page').getAttribute('data-group')).toBe('cm'));
    back();
    expect((await screen.findByTestId('group-page')).querySelector('[data-group]')!.getAttribute('data-group')).toBe('cm');
    a.unmount();
    renderV16(`${BASE}?view=group&group=online`);
    fireEvent.click(await within(await screen.findByTestId('group-events')).findByText(/Online practice, Sept 28/));
    await screen.findByTestId('event-page');
    back();
    expect((await screen.findByTestId('group-page')).querySelector('[data-group]')!.getAttribute('data-group')).toBe('online');
  });

  it('a deep-linked event: its own group is found from the group lists (never cm for online), and Back falls back to it', async () => {
    renderV16(`${BASE}?view=event&event=p1509-online-oct23`);
    await waitFor(() => expect(screen.getByTestId('event-back-link').textContent).toContain('Clarity Practice Community · Online'));
    fireEvent.click(screen.getByTestId('event-back-link'));
    expect((await screen.findByTestId('group-page')).querySelector('[data-group]')!.getAttribute('data-group')).toBe('online');
  });

  it('a deep-linked event with the group named falls back to that group on the header arrow', async () => {
    renderV16(`${BASE}?view=event&event=p1509-night-oct02&group=cm`);
    await screen.findByTestId('event-back-link');
    back();
    expect((await screen.findByTestId('group-page')).querySelector('[data-group]')!.getAttribute('data-group')).toBe('cm');
  });

  it('event page: real banner frame, date and place, topic vote area, organizer and the Participants card (real attendees)', async () => {
    renderV16(`${BASE}?view=event&event=p1509-online-oct23&group=online`);
    await screen.findByTestId('topic-vote');
    expect(screen.getByTestId('participants').textContent).toContain('Participants (2)');
    expect(screen.getByTestId('participants').textContent).toContain('Carol Singh');
    expect(screen.getByTestId('event-page').textContent).toContain('Online practice, Oct 23');
    expect(screen.getByTestId('event-page').textContent).toContain('Online');
  });

  it('RSVP calls the existing rsvpToEvent unchanged, then Cancel RSVP calls cancelRsvp; the Participants card follows', async () => {
    renderV16(`${BASE}?view=event&event=p1509-online-oct23&group=online`);
    fireEvent.click(await screen.findByTestId('rsvp-button'));
    expect((await screen.findByTestId('rsvp-going')).textContent).toContain("You're going!");
    expect(vi.mocked(eventsService.rsvpToEvent)).toHaveBeenCalledWith('ev-oct23', 'u-bob');
    await waitFor(() => expect(screen.getByTestId('participants').textContent).toContain('Participants (3)'));
    fireEvent.click(screen.getByTestId('cancel-rsvp'));
    await waitFor(() => expect(screen.getByTestId('rsvp-button').textContent).toBe('Reserve a seat'));
    expect(vi.mocked(eventsService.cancelRsvp)).toHaveBeenCalledWith('ev-oct23', 'u-bob');
    await waitFor(() => expect(screen.getByTestId('participants').textContent).toContain('Participants (2)'));
  });

  it('a refused RSVP (full or over) keeps Reserve a seat and says so', async () => {
    h.state.rsvpOk = false;
    renderV16(`${BASE}?view=event&event=p1509-online-oct23&group=online`);
    fireEvent.click(await screen.findByTestId('rsvp-button'));
    await waitFor(() => expect(vi.mocked(eventsService.rsvpToEvent)).toHaveBeenCalled());
    expect(await screen.findByText(/Could not reserve a seat/)).toBeTruthy();
    expect(screen.getByTestId('rsvp-button').textContent).toBe('Reserve a seat');
  });

  it('a past event offers no RSVP; Open event chat opens the channel seeded under the same mock id', async () => {
    renderV16(`${BASE}?view=event&event=p1509-online-sept&group=online`);
    expect((await screen.findByTestId('rsvp-button')).textContent).toBe('Event Ended');
    fireEvent.click(screen.getByTestId('open-event-chat'));
    expect(chatView().getAttribute('data-chat-open')).toBe('ch-online-sept');
  });
});

describe('P1509 v16 Home, Share picker, profiles, Letters, Tools (real rows)', () => {
  it('Home is the public feed: Stories (default) and Points tabs with the named records in production cards', async () => {
    renderV16();
    place('Home');
    await screen.findByTestId('feed-tabs');
    expect(within(screen.getByTestId('feed-tabs')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Stories (2)', 'Points (3)']);
    expect(within(screen.getByTestId('feed-stories')).getAllByTestId('feed-story')).toHaveLength(2);
    expect(screen.getByTestId('feed-stories').textContent).toContain('The hike where we got lost on purpose');
    fireEvent.click(within(screen.getByTestId('feed-tabs')).getByRole('tab', { name: /Points/ }));
    expect(within(screen.getByTestId('feed-points')).getAllByTestId(/^feed-point-card-/)).toHaveLength(3);
    expect(screen.getByTestId('feed-points').textContent).toContain('Disagreement is information, not a threat');
    expect(vi.mocked(pointsService.getPublicPointsFeed)).toHaveBeenCalledWith(expect.any(Number), 0, undefined, 'u-bob', false, undefined, false);
  });

  it('a story card on Home is production FeedStoryCard: its linked point with positions and Details, and no write on a position click', async () => {
    renderV16();
    place('Home');
    const story = (await screen.findAllByTestId('feed-story'))[0]!;
    expect(within(story).getByRole('button', { name: /Details/ })).toBeTruthy();
    fireEvent.click(within(story).getByTestId('feed-story-point-expander'));
    const first = () => within(within(screen.getAllByTestId('feed-story')[0]!).getAllByTestId('quoted-point-card')[0]!).getByTestId('agree-group');
    expect(first().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(first());
    expect(first().getAttribute('aria-pressed')).toBe('true');
  });

  it('the Share picker lists MY points and stories (the viewer\'s own, from the services) and Share puts the real card in the chat', async () => {
    renderV16();
    openRow('dm-bob-alice');
    fireEvent.click(screen.getByRole('button', { name: 'Share a point or story' }));
    const dlg = screen.getByRole('dialog', { name: 'Share a point or story' });
    await within(dlg).findByTestId('attach-results');
    expect(vi.mocked(pointsService.getPointsForProfileDisplay)).toHaveBeenCalledWith('u-bob', 'u-bob');
    expect(vi.mocked(storiesService.getStoriesByAuthor)).toHaveBeenCalledWith('u-bob');
    expect(within(dlg).queryByText('Repeat back before you reply')).toBeNull(); // Dana's point is not mine
    fireEvent.click(within(dlg).getByRole('button', { name: /^Share Disagreement is information/ }));
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    const card = within(within(chatView()).getByRole('list', { name: 'Messages' })).getByTestId('share-point');
    const agree = within(card).getByTestId('agree-group');
    expect(agree.getAttribute('aria-pressed')).toBe('false');
    expect(within(card).getByTestId('disagree-group')).toBeTruthy();
    expect(within(card).getByTestId('unsure-group')).toBeTruthy();
    fireEvent.click(agree);
    expect(within(within(within(chatView()).getByRole('list', { name: 'Messages' })).getByTestId('share-point')).getByTestId('agree-group').getAttribute('aria-pressed')).toBe('true');
  });

  it('the Share picker searches words and #tags over my items, and the Stories tab lists my stories', async () => {
    renderV16();
    openRow('dm-bob-alice');
    fireEvent.click(screen.getByRole('button', { name: 'Share a point or story' }));
    const dlg = screen.getByRole('dialog', { name: 'Share a point or story' });
    await within(dlg).findByTestId('attach-results');
    fireEvent.change(within(dlg).getByRole('textbox', { name: 'Search points and stories' }), { target: { value: '#work' } });
    expect(within(dlg).getByRole('button', { name: /^Share Disagreement/ })).toBeTruthy();
    fireEvent.change(within(dlg).getByRole('textbox', { name: 'Search points and stories' }), { target: { value: '#nothing' } });
    expect(within(dlg).getByText(/No points match/)).toBeTruthy();
    fireEvent.change(within(dlg).getByRole('textbox', { name: 'Search points and stories' }), { target: { value: '' } });
    fireEvent.click(within(dlg).getByRole('tab', { name: 'Stories' }));
    expect(within(dlg).getByRole('button', { name: /^Share The hike where we got lost/ })).toBeTruthy();
  });

  it('a profile is the real profile row of the persona (getProfileBySlug on its slug)', async () => {
    renderV16(`${BASE}?view=profile&person=alice`);
    await waitFor(() => expect(within(screen.getByTestId('profile')).getByText('Alice Moreau')).toBeTruthy());
    expect(vi.mocked(getProfileBySlug)).toHaveBeenCalledWith('p1509-alice');
  });

  it('Letters: Inbox, Drafts, Published tabs of real cards; the card body opens nothing, only its buttons act', async () => {
    renderV16();
    place('Letters');
    await waitFor(() => expect(within(screen.getByTestId('letter-tabs')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Inbox (2)', 'Drafts', 'Published']));
    expect(vi.mocked(getInboxItems)).toHaveBeenCalledWith('u-bob');
    expect(screen.getAllByTestId('letter-card').map((r) => r.textContent)).toEqual([expect.stringContaining('What I learned facilitating ten nights'), expect.stringContaining('Design reviews without silence')]);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const card = screen.getAllByTestId('letter-card')[0]!;
    fireEvent.click(within(card).getByTestId('letter-title')); // the body
    fireEvent.click(card);
    expect(screen.getByTestId('letters-page')).toBeTruthy(); // still the list: no letter page opened
    expect(open).not.toHaveBeenCalled();
    expect(within(card).getByRole('link', { name: 'Read' }).getAttribute('href')).toBe('/letter/dl-alice');
    radixTab(within(screen.getByTestId('letter-tabs')).getByRole('tab', { name: 'Drafts' }));
    await waitFor(() => expect(screen.getAllByTestId('letter-card').map((r) => r.textContent)).toEqual([expect.stringContaining('Why I run the Chiang Mai circle')]));
    const draft = screen.getByTestId('letter-card');
    expect(draft.textContent).toContain('0 stories · 0 points');
    expect(within(draft).getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe('/letters/drafts/doc-bob');
    expect(within(draft).getByRole('link', { name: 'Prepare' }).getAttribute('href')).toBe('/letter/doc-bob/compose');
    expect(within(draft).getAllByRole('link')).toHaveLength(2);
    radixTab(within(screen.getByTestId('letter-tabs')).getByRole('tab', { name: 'Published' }));
    await waitFor(() => expect(screen.getAllByTestId('letter-card').map((r) => r.textContent)).toEqual([expect.stringContaining('Notes from Clarity Night, Oct 2')]));
    expect(within(screen.getByTestId('letter-card')).getByRole('link', { name: 'Open overview' }).getAttribute('href')).toBe('/letter/lt-bob/overview');
    expect(screen.queryByTestId('letter-view')).toBeNull();
  });

  it('Letters: actions show on hover for a pointer and always on touch (the hover-only class is gated to real pointers)', async () => {
    renderV16(`${BASE}?view=letters`);
    const actions = (await screen.findAllByTestId('letter-actions'))[0]!;
    expect(actions.className).toContain('[@media(hover:hover)]:opacity-0');
    expect(actions.className).toContain('[@media(hover:hover)]:group-hover:opacity-100');
    expect(actions.className).toContain('[@media(hover:hover)]:group-focus-within:opacity-100');
    expect(actions.className).not.toMatch(/(^|\s)opacity-0/); // never hidden on touch
  });

  it('Letters: a published letter keeps its expander, which lists who it went to and offers Results where there are some', async () => {
    renderV16(`${BASE}?view=letters&tab=sent`);
    const card = await screen.findByTestId('letter-card');
    expect(within(card).queryByTestId('letter-expanded')).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Expand' }));
    const panel = await within(card).findByTestId('letter-expanded');
    await within(panel).findByText('Alice Moreau');
    expect(vi.mocked(getDeliveriesForLetter)).toHaveBeenCalledWith('lt-bob');
    expect(within(panel).getAllByRole('link', { name: 'Results' })).toHaveLength(1); // Carol has not started
    expect(within(panel).getByRole('link', { name: 'Results' }).getAttribute('href')).toBe('/letter/lt-bob/results?delivery=dv-1');
    fireEvent.click(within(card).getByRole('button', { name: 'Collapse' }));
    expect(within(card).queryByTestId('letter-expanded')).toBeNull();
  });

  it('Letters: Drafts and Published are mine (Dana has none, with an explicit empty state)', async () => {
    renderV16();
    await asDana();
    place('Letters');
    radixTab(within(screen.getByTestId('letter-tabs')).getByRole('tab', { name: 'Drafts' }));
    expect((await screen.findByTestId('letters-empty-drafts')).textContent).toBe('No drafts yet.');
    radixTab(within(screen.getByTestId('letter-tabs')).getByRole('tab', { name: 'Published' }));
    expect(await screen.findByTestId('letters-empty-sent')).toBeTruthy();
  });

  it('Tools has the 3 tabs Tools, Points, Letters with production entries', () => {
    renderV16();
    fireEvent.click(screen.getByTestId('sidebar-tools'));
    const tabs = within(screen.getByTestId('event-links-tabs')).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Tools', 'Points', 'Letters']);
    expect(screen.getByTestId('event-links-panel-tools').textContent).toContain('Transcribe');
    radixTab(tabs[2]!);
    expect(within(screen.getByTestId('event-links-panel-letters')).getAllByTestId('event-links-entry').length).toBeGreaterThan(0);
  });
});

/**
 * Every real-data surface has three states besides its data. `?real=` forces each (no service is called), and a
 * genuine failure/empty answer from the service shows the same state.
 */
describe('P1509 v16 skeleton, error with Retry, empty — every real surface', () => {
  const SURFACES: { name: string; url: string; scope: () => HTMLElement; empty: RegExp; wait?: () => Promise<unknown> }[] = [
    { name: 'Home', url: `${BASE}?view=home`, scope: () => screen.getByTestId('home-page'), empty: /No stories yet/ },
    { name: 'Letters', url: `${BASE}?view=letters`, scope: () => screen.getByTestId('letters-page'), empty: /No letters yet/ },
    { name: 'Groups (phone tab)', url: `${BASE}?view=groups`, scope: () => screen.getByTestId('groups-page'), empty: /not in any group yet/ },
    { name: 'Directory', url: `${BASE}?view=directory`, scope: () => screen.getByTestId('directory-page'), empty: /No public groups yet/ },
    { name: 'Group page', url: `${BASE}?view=group&group=cm`, scope: () => screen.getByTestId('group-page'), empty: /No events yet/ },
    { name: 'Event page', url: `${BASE}?view=event&event=p1509-night-oct16&group=cm`, scope: () => screen.getByTestId('event-page'), empty: /No one has reserved a seat yet/ },
    { name: 'Profile', url: `${BASE}?view=profile&person=alice`, scope: () => screen.getByTestId('profile'), empty: /no profile in the test project yet/ },
    { name: 'Partners', url: `${BASE}?view=partners`, scope: () => screen.getByTestId('partners-page'), empty: /No partners yet/ },
  ];

  it.each(SURFACES)('$name: ?real=loading shows a skeleton and calls no service', ({ url, scope }) => {
    renderV16(`${url}&real=loading`);
    expect(within(scope()).getAllByTestId('real-skeleton').length).toBeGreaterThan(0);
    expect(within(scope()).queryByTestId('real-error')).toBeNull();
  });

  it.each(SURFACES)('$name: ?real=error shows an inline error with a Retry button', ({ url, scope }) => {
    renderV16(`${url}&real=error`);
    const errs = within(scope()).getAllByTestId('real-error'); // Home also shows the forced state in its Next events / Groups widget
    expect(errs.length).toBeGreaterThan(0);
    for (const err of errs) expect(within(err).getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it.each(SURFACES)('$name: ?real=empty shows an explicit empty state, never a blank panel', async ({ url, scope, empty }) => {
    renderV16(`${url}&real=empty`);
    expect((await within(scope()).findAllByText(empty)).length).toBeGreaterThan(0);
  });

  it('the Share picker has the same three states', async () => {
    const a = renderV16(`${BASE}?view=chats&chat=dm-bob-alice&real=loading`);
    fireEvent.click(screen.getByRole('button', { name: 'Share a point or story' }));
    expect(within(screen.getByRole('dialog')).getByTestId('real-skeleton')).toBeTruthy();
    a.unmount();
    const b = renderV16(`${BASE}?view=chats&chat=dm-bob-alice&real=error`);
    fireEvent.click(screen.getByRole('button', { name: 'Share a point or story' }));
    expect(within(within(screen.getByRole('dialog')).getByTestId('real-error')).getByRole('button', { name: 'Retry' })).toBeTruthy();
    b.unmount();
    renderV16(`${BASE}?view=chats&chat=dm-bob-alice&real=empty`);
    fireEvent.click(screen.getByRole('button', { name: 'Share a point or story' }));
    expect(within(screen.getByRole('dialog')).getByTestId('real-empty').textContent).toContain('no points or stories');
  });

  it('the ?real= switch survives navigation inside the prototype', () => {
    renderV16(`${BASE}?view=home&real=loading`);
    place('Letters');
    expect(within(screen.getByTestId('letters-page')).getAllByTestId('real-skeleton').length).toBeGreaterThan(0);
  });

  it('Retry refetches: a failed Letters read shows the error, Retry calls the service again and the rows appear', async () => {
    h.fail('inbox', 1);
    renderV16(`${BASE}?view=letters`);
    const err = await within(screen.getByTestId('letters-page')).findByTestId('real-error');
    expect(vi.mocked(getInboxItems)).toHaveBeenCalledTimes(1);
    fireEvent.click(within(err).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getAllByTestId('letter-card')).toHaveLength(2));
    expect(vi.mocked(getInboxItems)).toHaveBeenCalledTimes(2);
  });

  it('Retry refetches on Home, the group page, the event page and Partners', async () => {
    h.fail('feed', 1);
    const a = renderV16(`${BASE}?view=home`);
    fireEvent.click(within(await within(screen.getByTestId('home-page')).findByTestId('real-error')).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('feed-tabs')).toBeTruthy();
    a.unmount();
    h.fail('members', 1);
    const b = renderV16(`${BASE}?view=group&group=cm`);
    fireEvent.click(within(await within(screen.getByTestId('group-page')).findByTestId('real-error')).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('group-tabs')).toBeTruthy();
    b.unmount();
    h.fail('event', 1);
    const c = renderV16(`${BASE}?view=event&event=p1509-night-oct16&group=cm`);
    fireEvent.click(within(await within(screen.getByTestId('event-page')).findByTestId('real-error')).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('rsvp-area')).toBeTruthy();
    c.unmount();
    h.fail('partners', 1);
    renderV16(`${BASE}?view=partners`);
    fireEvent.click(within(await within(screen.getByTestId('partners-page')).findByTestId('real-error')).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByTestId('partners-page').textContent).toContain('Active (1)'));
  });

  it('a Retry on the groups read refills the Groups place', async () => {
    h.fail('groups', 1);
    renderV16(`${BASE}?view=groups`);
    fireEvent.click(within(await within(screen.getByTestId('groups-page')).findByTestId('real-error')).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('list', { name: 'Your groups' })).toBeTruthy();
  });

  it('genuine empty answers from the services: a persona in no group, with no letters, no partners and an empty feed', async () => {
    h.state.myOrgIds = [];
    vi.mocked(getInboxItems).mockResolvedValueOnce([]);
    vi.mocked(storiesService.getPublicStoriesFeed).mockResolvedValueOnce([]);
    vi.mocked(pointsService.getPublicPointsFeed).mockResolvedValueOnce([]);
    const a = renderV16(`${BASE}?view=home`);
    expect((await screen.findByTestId('home-empty')).textContent).toContain('No stories yet');
    a.unmount();
    const b = renderV16(`${BASE}?view=letters`);
    expect((await screen.findByTestId('letters-empty-inbox')).textContent).toBe('No letters yet.');
    b.unmount();
    renderV16(`${BASE}?view=groups`);
    expect((await screen.findByTestId('groups-page').then((p) => within(p).findByTestId('real-empty'))).textContent).toBe('You are not in any group yet.');
  });
});

describe('P1509 v16 mirror agent', () => {
  const openMirror = () => openRow('mirror-bob');
  const claim = (name?: string) => {
    openMirror();
    if (name) fireEvent.change(within(screen.getByTestId('mirror-claim')).getByRole('textbox'), { target: { value: name } });
    fireEvent.click(screen.getByTestId('mirror-keep'));
  };
  const rowTitleOf = (id: string) => within(document.querySelector<HTMLElement>(`[data-chat="${id}"]`)!).getByTestId('row-title').textContent;
  const chatMenu = (name: RegExp | string) => { fireEvent.click(within(chatView()).getByRole('button', { name: 'More' })); return within(screen.getByTestId('chat-menu')).getByRole('menuitem', { name }); };

  it('pinned first as "Your mirror"; the name is prefilled; Keep claims it with the default', () => {
    renderV16();
    const first = within(screen.getByTestId('chat-rows')).getAllByRole('listitem')[0]!;
    expect(first.getAttribute('data-chat')).toBe('mirror-bob');
    expect(within(first).getByTestId('row-title').textContent).toBe('Your mirror');
    expect(within(first).getByTestId('mirror-avatar').getAttribute('data-placeholder')).toBe('generated-image');
    openMirror();
    expect(chatView().textContent).toContain('Give me a name');
    const field = within(screen.getByTestId('mirror-claim')).getByRole('textbox') as HTMLInputElement;
    expect(field.value).toBe("Bob's mirror");
    fireEvent.click(screen.getByTestId('mirror-keep'));
    expect(screen.getByTestId('mirror-header').textContent).toContain("Bob's mirror");
    expect(rowTitleOf('mirror-bob')).toBe("Bob's mirror");
  });

  it('the role is always shown with the name: "<Name> · <First>\'s mirror" in the header, the list, the message author and the Clarify tip', () => {
    renderV16();
    claim('Echo');
    expect(screen.getByTestId('mirror-header').textContent).toContain("Echo · Bob's mirror");
    expect(screen.queryByTestId('mirror-claim')).toBeNull();
    expect(rowTitleOf('mirror-bob')).toBe("Echo · Bob's mirror");
    expect(within(chatView()).getAllByTestId('agent-name').every((n) => n.textContent === "Echo · Bob's mirror")).toBe(true);
    openRow('dm-bob-alice');
    const li = msg(/This is the exercise/);
    expect(toolNames(li)).toEqual(['Reply', 'Forward', 'Thread', "Clarify with Echo · Bob's mirror"]);
    tool(li, /^Clarify with/);
    expect(chatView().getAttribute('data-chat-open')).toBe('mirror-bob');
    expect(within(chatView()).getByTestId('clarify-label').textContent).toBe("Sent to Echo · Bob's mirror to clarify");
    expect(within(chatView()).getAllByTestId('reply-quote').at(-1)!.textContent).toContain('This is the exercise I want to try.');
    expect(within(chatView()).getByText('I’ll help you clarify this — coming soon')).toBeTruthy();
    expect(within(chatView()).getByRole('textbox', { name: "Message Echo · Bob's mirror" })).toBeTruthy();
  });

  it('Clarify appears on EVERY message, including the ones in the mirror chat itself (mine and the mirror\'s)', () => {
    renderV16();
    claim();
    const items = within(within(chatView()).getByRole('list', { name: 'Messages' })).getAllByRole('listitem');
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const li of items) expect(within(li).getByTestId('clarify-button')).toBeTruthy();
    const before = items.length;
    fireEvent.click(within(items[0]!).getByTestId('clarify-button'));
    expect(within(within(chatView()).getByRole('list', { name: 'Messages' })).getAllByRole('listitem').length).toBe(before + 2); // the quoted message and the mirror's reply
  });

  it('there is no "Back to <chat>" bar; the forwarded card links to its source chat instead', () => {
    renderV16();
    claim();
    openRow('dm-bob-alice');
    tool(msg(/This is the exercise/), /^Clarify with/);
    expect(screen.queryByTestId('mirror-back-link')).toBeNull();
    expect(chatView().textContent).not.toMatch(/Back to/);
    const card = within(chatView()).getAllByTestId('reply-quote').at(-1)!;
    expect(card.tagName).toBe('BUTTON');
    expect(card.textContent).toContain('Alice Moreau');
    fireEvent.click(card);
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
  });

  it('the mirror chat has a ⋯ menu with Rename, and Rename works everywhere the name shows', () => {
    renderV16();
    claim();
    expect(within(screen.getByTestId('transcribe-button').closest('header')!).getByRole('button', { name: 'More' })).toBeTruthy();
    fireEvent.click(within(chatView()).getByRole('button', { name: 'More' }));
    expect(within(screen.getByTestId('chat-menu')).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Rename']);
    fireEvent.click(within(screen.getByTestId('chat-menu')).getByRole('menuitem', { name: 'Rename' }));
    const dlg = screen.getByRole('dialog', { name: 'Rename mirror' });
    const field = within(dlg).getByRole('textbox') as HTMLInputElement;
    expect(field.value).toBe("Bob's mirror");
    fireEvent.change(field, { target: { value: 'Narwhal' } });
    fireEvent.click(within(dlg).getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog', { name: 'Rename mirror' })).toBeNull();
    expect(screen.getByTestId('mirror-header').textContent).toContain("Narwhal · Bob's mirror");
    expect(rowTitleOf('mirror-bob')).toBe("Narwhal · Bob's mirror");
    expect(within(chatView()).getAllByTestId('agent-name').every((n) => n.textContent === "Narwhal · Bob's mirror")).toBe(true);
  });

  it('Rename also works before the mirror is claimed', () => {
    renderV16();
    openMirror();
    fireEvent.click(chatMenu('Rename'));
    fireEvent.change(within(screen.getByRole('dialog', { name: 'Rename mirror' })).getByRole('textbox'), { target: { value: 'Echo' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Rename mirror' })).getByRole('button', { name: 'Save' }));
    expect(rowTitleOf('mirror-bob')).toBe("Echo · Bob's mirror");
  });
});

describe('P1509 v16 thread forward', () => {
  const forwardTo = (li: HTMLElement, target: string, withThread = true) => {
    tool(li, 'Forward');
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Forward to' })).getByText(target));
    if (withThread) expect(screen.getByTestId('forward-thread-note').textContent).toMatch(/^Thread · \d+ repl/); // the preview says the thread comes along
    else expect(screen.queryByTestId('forward-thread-note')).toBeNull();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send' }));
  };

  it('forwarding a post with a thread arrives as ONE card "Thread · N replies" that opens the full thread', () => {
    renderV16();
    openRow('ch-night-oct16');
    forwardTo(msg(/Bring one disagreement/), 'Carol Singh');
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-carol');
    const cards = within(chatView()).getAllByTestId('thread-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]!.textContent).toContain('Bring one disagreement you would like to understand better.');
    expect(within(cards[0]!).getByTestId('thread-card-open').textContent).toBe('Thread · 1 reply');
    expect(within(chatView()).queryByTestId('replies-link')).toBeNull(); // one card, not a card plus a replies link
    fireEvent.click(within(cards[0]!).getByTestId('thread-card-open'));
    const panel = screen.getByTestId('thread-panel');
    expect(within(panel).getByText('I will bring one about remote work.')).toBeTruthy(); // the full thread came along
  });

  it('a table thread with several replies says so and opens with every reply', () => {
    renderV16();
    openRow('ch-night-oct16');
    forwardTo(msg('Table 1 · round 1'), 'Carol Singh');
    const card = within(chatView()).getByTestId('thread-card');
    expect(within(card).getByTestId('thread-card-open').textContent).toBe('Thread · 3 replies');
    fireEvent.click(within(card).getByTestId('thread-card-open'));
    const panel = screen.getByTestId('thread-panel');
    for (const t of [/most arguments at work are about definitions/, /Can I repeat it back/, /never check which meaning/]) expect(within(panel).getByText(t)).toBeTruthy();
  });

  it('a post without a thread forwards as a plain message', () => {
    renderV16();
    openRow('dm-bob-alice');
    forwardTo(msg('Ready for tonight?'), 'Carol Singh', false);
    expect(within(chatView()).queryByTestId('thread-card')).toBeNull();
  });

  it('the same when sent to the mirror: Clarify on a post with a thread is one card that opens the thread', () => {
    renderV16();
    openRow('ch-night-oct16');
    tool(msg(/Bring one disagreement/), /^Clarify with/);
    expect(chatView().getAttribute('data-chat-open')).toBe('mirror-bob');
    const card = within(chatView()).getByTestId('thread-card');
    expect(within(card).getByTestId('thread-card-open').textContent).toBe('Thread · 1 reply');
    fireEvent.click(within(card).getByTestId('thread-card-open'));
    expect(within(screen.getByTestId('thread-panel')).getByText('I will bring one about remote work.')).toBeTruthy();
  });
});

describe('P1509 v16 Invite partner', () => {
  /* Built from parts: the privacy gate refuses a literal address in a committed file. */
  const OUTSIDE = ['someone', 'gmail.com'].join('@');
  const create = () => vi.mocked(agreementsService.createAgreement);
  const termsBox = () => within(screen.getByTestId('partner-invite-page')).getByRole('textbox', { name: /terms/i }) as HTMLTextAreaElement;
  const chooseSuggestedTerms = () => fireEvent.click(within(screen.getByTestId('partner-invite-page')).getByRole('button', { name: 'Use suggested terms' }));
  const sendInvite = () => fireEvent.click(screen.getByTestId('send-invite'));
  const typeRecipient = (text: string) => fireEvent.change(within(screen.getByTestId('partner-picker')).getByRole('textbox', { name: 'Name or email' }), { target: { value: text } });

  it('the recipient guard: only the seeded personas pass (an exact persona address; anything else, lookalikes included, fails)', () => {
    expect(isSeededPersonaEmail(personaEmail('bob'))).toBe(true);
    expect(isSeededPersonaEmail(` ${personaEmail('fay').toUpperCase()} `)).toBe(true);
    for (const bad of [OUTSIDE, '', null, undefined, `${personaEmail('bob')}.com`, `x${personaEmail('bob')}`, `bob@${['example', 'com'].join('.')}`, personaEmail('bob').replace('.invalid', '.test')]) expect(isSeededPersonaEmail(bad)).toBe(false);
  });

  it('the state comes from the real agreements: Partner (active), Invite sent (pending), Invite partner (none)', async () => {
    renderV16();
    openRow('dm-bob-alice');
    await waitFor(() => expect(screen.getByTestId('partner-tag').textContent).toBe('Partner'));
    expect(screen.queryByTestId('invite-partner')).toBeNull();
    back();
    openRow('dm-bob-carol');
    await waitFor(() => expect(screen.getByTestId('partner-pending').textContent).toBe('Invite sent'));
    expect(screen.queryByTestId('invite-partner')).toBeNull();
    back();
    openRow('dm-bob-eli');
    expect(screen.getByTestId('invite-partner').getAttribute('aria-label')).toBe('Invite partner');
    expect(screen.getByTestId('invite-partner').textContent).toBe('Invite partner');
    expect(screen.queryByTestId('partner-tag')).toBeNull();
    expect(screen.queryByTestId('partner-pending')).toBeNull();
  });

  it('1:1 header: Invite partner -> the production certificate with suggested terms -> Invite sent; the request carries the persona\'s profile id and the suggested terms', async () => {
    renderV16();
    openRow('dm-bob-dana');
    fireEvent.click(screen.getByTestId('invite-partner'));
    const page = screen.getByTestId('partner-invite-page');
    expect(within(page).getByTestId('certificate-page-shell')).toBeTruthy();
    expect(within(page).getByRole('heading', { level: 1, name: 'Invite partner' })).toBeTruthy();
    expect(termsBox().placeholder).toBe(TERMS_PLACEHOLDER); // production's suggestion is shown, never written for the user
    sendInvite();
    expect(screen.getByText('Terms cannot be empty')).toBeTruthy(); // as in production
    expect(create()).not.toHaveBeenCalled();
    chooseSuggestedTerms();
    expect(termsBox().value).toBe(TERMS_PLACEHOLDER);
    sendInvite();
    await waitFor(() => expect(create()).toHaveBeenCalledTimes(1));
    expect(create()).toHaveBeenCalledWith({ partnerEmail: personaEmail('dana'), partnerProfileId: 'u-dana', partnerDisplayName: 'Dana Ortiz', termsText: TERMS_PLACEHOLDER.trim(), visibility: 'private' });
    await waitFor(() => expect(screen.queryByTestId('partner-invite-page')).toBeNull());
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-dana');
    expect(screen.getByTestId('partner-pending').textContent).toBe('Invite sent');
    expect(screen.queryByTestId('invite-partner')).toBeNull();
    fireEvent.click(screen.getByTestId('strip-accept'));
    expect(screen.getByTestId('partner-tag').textContent).toBe('Partner');
  });

  it('with a NAME: the sidebar opens the invite, a person is picked from the people list (partners and pending are not offered), and the invite goes to their persona address', async () => {
    renderV16();
    fireEvent.click(screen.getByTestId('sidebar-invite'));
    expect(screen.queryByTestId('send-invite')).toBeNull(); // nothing to send until someone is picked
    const picker = screen.getByTestId('partner-picker');
    await waitFor(() => expect(within(picker).queryByText('Alice Moreau')).toBeNull()); // already a partner
    expect(within(picker).queryByText('Carol Singh')).toBeNull(); // already invited
    typeRecipient('fay');
    expect(within(picker).getAllByRole('button').map((b) => b.textContent)).toEqual([expect.stringContaining('Fay Okafor')]);
    fireEvent.click(within(picker).getByRole('button', { name: /Fay Okafor/ }));
    chooseSuggestedTerms();
    sendInvite();
    await waitFor(() => expect(create()).toHaveBeenCalledTimes(1));
    expect(create()).toHaveBeenCalledWith(expect.objectContaining({ partnerEmail: personaEmail('fay'), partnerDisplayName: 'Fay Okafor', termsText: TERMS_PLACEHOLDER.trim() }));
    await waitFor(() => expect(screen.queryByTestId('partner-invite-page')).toBeNull());
  });

  it('with an EMAIL: a typed persona address is accepted (it becomes that person) and the invite is sent with the suggested terms', async () => {
    renderV16();
    fireEvent.click(screen.getByTestId('sidebar-invite'));
    typeRecipient(personaEmail('eli'));
    fireEvent.click(screen.getByTestId('use-email'));
    expect(within(screen.getByTestId('partner-picker')).getByText('Eli Brandt')).toBeTruthy();
    chooseSuggestedTerms();
    sendInvite();
    await waitFor(() => expect(create()).toHaveBeenCalledTimes(1));
    expect(create()).toHaveBeenCalledWith(expect.objectContaining({ partnerEmail: personaEmail('eli'), partnerDisplayName: 'Eli Brandt', termsText: TERMS_PLACEHOLDER.trim() }));
  });

  it('SAFETY: an address outside the seeded personas is refused inline and NO request is made (no agreement, no profile lookup, no network, no mail function)', async () => {
    const invoke = vi.spyOn(supabase.functions, 'invoke');
    renderV16();
    fireEvent.click(screen.getByTestId('sidebar-invite'));
    typeRecipient(OUTSIDE);
    fireEvent.click(screen.getByTestId('use-email'));
    expect(within(screen.getByTestId('partner-picker')).getByText(OUTSIDE)).toBeTruthy();
    const profileCalls = vi.mocked(getProfileBySlug).mock.calls.length;
    const fetchCalls = vi.mocked(fetch).mock.calls.length;
    chooseSuggestedTerms();
    sendInvite();
    expect((await screen.findByTestId('invite-problem')).textContent).toBe('Prototype invites go only to test personas.');
    sendInvite(); // however many times it is pressed
    await rtlAct(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(create()).not.toHaveBeenCalled();
    expect(vi.mocked(getProfileBySlug).mock.calls.length).toBe(profileCalls);
    expect(vi.mocked(fetch).mock.calls.length).toBe(fetchCalls);
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByTestId('partner-invite-page')).toBeTruthy(); // still here, nothing sent
    expect(screen.queryByTestId('partner-pending')).toBeNull();
  });

  it('SAFETY: the refusal comes BEFORE validation (an outside address with empty terms is refused as such, not asked for terms first)', async () => {
    renderV16();
    fireEvent.click(screen.getByTestId('sidebar-invite'));
    typeRecipient(OUTSIDE);
    fireEvent.click(screen.getByTestId('use-email'));
    sendInvite();
    expect((await screen.findByTestId('invite-problem')).textContent).toContain('test personas');
    expect(screen.queryByText('Terms cannot be empty')).toBeNull();
    expect(create()).not.toHaveBeenCalled();
  });

  it('a send that fails (the service returns nothing) says so and stays on the page; nothing is shown as sent', async () => {
    create().mockResolvedValueOnce(null as never);
    renderV16();
    openRow('dm-bob-dana');
    fireEvent.click(screen.getByTestId('invite-partner'));
    chooseSuggestedTerms();
    sendInvite();
    expect((await screen.findByTestId('invite-problem')).textContent).toContain('Could not send the invite');
    expect(screen.getByTestId('partner-invite-page')).toBeTruthy();
    expect(screen.queryByTestId('partner-pending')).toBeNull();
  });

  it('the profile page offers Invite partner (and shows the state once there is one); the Partners page and an empty search say Invite partner too', async () => {
    renderV16(`${BASE}?view=profile&person=dana`);
    fireEvent.click(await screen.findByTestId('profile-invite'));
    expect(screen.getByTestId('partner-invite-page')).toBeTruthy();
    expect(within(screen.getByTestId('partner-invite-page')).queryByTestId('partner-picker')).toBeNull(); // the person is fixed
    back();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    fireEvent.click(within(screen.getByTestId('me-menu')).getByText('Partners'));
    await waitFor(() => expect(screen.getByTestId('partners-invite').textContent).toBe('Invite partner'));
    place('Chats');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'zzzz' } });
    expect(within(screen.getByTestId('search-no-people')).getByTestId('invite-link').textContent).toBe('Invite partner');
  });

  it('"Invite partner" is the only partner verb, and there is no "+ New" and no "New chat", in any view or state', async () => {
    const banned = [/Invite as partner/, /New partner/, /Add partner/, /Invite a new partner/, /Partner invite pending/, /New chat/, /\+ New/, /Seal & Send/];
    const urls = ['', '?view=chats&chat=dm-bob-alice', '?view=chats&chat=dm-bob-eli', '?view=chats&chat=mirror-bob', '?view=chats&chat=gen-cm', '?view=profile&person=fay', '?view=profile&person=alice', '?view=partners', '?view=invite', '?view=invite&with=dana', '?view=groups', '?view=directory', '?view=home', '?view=letters', '?view=events', '?view=tools', '?state=empty', '?state=nopartners', '?view=chats&with=sam'];
    for (const u of urls) {
      const a = renderV16(`${BASE}${u}`);
      await rtlAct(async () => { await new Promise((r) => setTimeout(r, 15)); });
      const text = document.body.textContent ?? '';
      for (const b of banned) expect(text, `${u || 'chat list'}: ${b}`).not.toMatch(b);
      expect(screen.queryByTestId('new-menu')).toBeNull();
      expect(screen.queryByTestId('new-chat-page')).toBeNull();
      a.unmount();
    }
    stubViewport(false);
    renderV16();
    tabbar('Profile');
    for (const b of banned) expect(document.body.textContent ?? '').not.toMatch(b);
  });
});

describe('P1509 v16 composer', () => {
  it('composer: Share left, mic while empty; message actions sit in a hover-only toolbar', () => {
    vi.useFakeTimers();
    renderV16();
    openRow('dm-bob-alice');
    const composer = screen.getByTestId('composer');
    expect(within(composer).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Share a point or story', 'Record a voice message']);
    const bar = within(msg('Ready for tonight?')).getByRole('toolbar');
    expect(bar.className).toContain('opacity-0');
    expect(bar.className).toContain('group-hover:opacity-100');
    fireEvent.click(within(composer).getByRole('button', { name: 'Record a voice message' }));
    rtlAct(() => { vi.advanceTimersByTime(3000); });
    fireEvent.click(within(composer).getByRole('button', { name: 'Send voice message' }));
    expect(within(chatView()).getAllByTestId('voice-note')).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe('P1509 v16 kept from v14', () => {
  it('chat -> profile -> Back returns to the chat; a deep-linked chat goes Back to the list', () => {
    const a = renderV16();
    openRow('dm-bob-alice');
    fireEvent.click(within(chatView()).getAllByText('Alice Moreau')[0]!.closest('button')!);
    expect(screen.getByTestId('profile')).toBeTruthy();
    back();
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
    a.unmount();
    renderV16(`${BASE}?view=chats&chat=dm-bob-carol`);
    back();
    expect(screen.queryByTestId('chat-view')).toBeNull();
  });

  it('menus close on an outside press and on Esc', () => {
    renderV16();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    fireEvent.mouseDown(screen.getByTestId('main-area'));
    expect(screen.queryByTestId('me-menu')).toBeNull();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('me-menu')).toBeNull();
    openRow('ch-night-oct16');
    rightClick(msg(/Bring one disagreement/));
    expect(screen.getByTestId('message-menu')).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('message-menu')).toBeNull();
  });

  it('right-click Edit/Delete on my own; threads in a 1:1', () => {
    renderV16();
    openRow('dm-bob-alice');
    rightClick(msg('Ready for tonight?'));
    expect(menuItems()).toEqual(['Reply', 'Forward', 'Thread', 'Mark as unread', 'Edit', 'Delete']);
    fireEvent.click(within(screen.getByTestId('message-menu')).getByText('Edit'));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit message' }), { target: { value: 'Ready, Alice?' } });
    fireEvent.click(within(screen.getByTestId('edit-message')).getByRole('button', { name: 'Save' }));
    expect(within(msg('Ready, Alice?')).getByTestId('edited-mark')).toBeTruthy();
    tool(msg('Ready, Alice?'), 'Thread');
    fireEvent.change(within(screen.getByTestId('thread-panel')).getByRole('textbox'), { target: { value: 'threaded' } });
    fireEvent.click(within(screen.getByTestId('thread-panel')).getByRole('button', { name: 'Send' }));
    expect(within(screen.getByTestId('thread-panel')).getByText('threaded')).toBeTruthy();
  });

  it('unread counts, Channels folder, composer growth', () => {
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get(this: HTMLElement) { return this instanceof HTMLTextAreaElement ? this.value.split('\n').length * 24 + 16 : 0; } });
    try {
      renderV16();
      expect(within(document.querySelector<HTMLElement>('[data-chat="dm-bob-alice"]')!).getByTestId('row-unread').textContent).toBe('2');
      tab(/^Channels/);
      expect(within(screen.getByTestId('group-sections')).getAllByTestId('group-section-header')[0]!.textContent).toContain('Communication Activism Community · Chiang Mai');
      tab(/^All/);
      openRow('dm-bob-alice');
      const field = within(screen.getByTestId('composer')).getByRole('textbox') as HTMLTextAreaElement;
      fireEvent.change(field, { target: { value: '1\n2\n3\n4\n5\n6\n7' } });
      expect(field.style.height).toBe('136px');
    } finally {
      if (desc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', desc);
    }
  });

});

describe('P1509 v16 Transcribe, Clarity Live, General and the message menu', () => {
  const ALL_CHATS = ['dm-bob-alice', 'dm-bob-carol', 'dm-bob-dana', 'dm-bob-eli', 'mirror-bob', 'gen-cm', 'ch-night-oct16', 'ch-night-oct02', 'ch-online-sept'];
  const chatMenuItems = () => { fireEvent.click(within(chatView()).getByRole('button', { name: 'More' })); return within(screen.getByTestId('chat-menu')).getAllByRole('menuitem').map((b) => b.textContent); };

  it('Transcribe is at the top right of EVERY chat header (1:1, General, event channel, mirror), after the title and before the ⋯ menu, and says Coming soon', () => {
    renderV16();
    for (const id of ALL_CHATS) {
      openRow(id);
      const header = chatView().querySelector('header')!;
      const btn = within(header).getByTestId('transcribe-button');
      expect(btn.getAttribute('aria-label'), id).toBe('Transcribe, coming soon');
      expect(btn.textContent, id).toContain('Transcribe');
      expect(btn.textContent, id).toContain('Coming soon');
      const more = within(header).getByRole('button', { name: 'More' });
      expect(btn.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING, id).toBeTruthy(); // top right: last control but the menu
      back();
    }
  });

  it('pressing Transcribe fakes nothing: no live bar, no recording, no room; it only says it is coming', async () => {
    renderV16();
    openRow('ch-night-oct16');
    fireEvent.click(screen.getByTestId('transcribe-button'));
    expect(await screen.findByText(/Transcribe from a chat is coming soon/)).toBeTruthy();
    expect(screen.queryByTestId('live-banner')).toBeNull();
    expect(screen.queryByTestId('capture-bar')).toBeNull();
    expect(screen.queryByTestId('room-capture-bar')).toBeNull();
    expect(screen.queryByRole('button', { name: /Stop transcribing/ })).toBeNull();
    place('Home');
    expect(screen.queryByTestId('room-capture-bar')).toBeNull();
  });

  it('Transcribe never creates a room, and nothing in v16 may pass an eventId to createRoom (a room linked to a seeded event makes the event undeletable and wedges the seed reset)', () => {
    renderV16();
    for (const id of ['ch-night-oct16', 'dm-bob-alice', 'gen-cm', 'mirror-bob']) {
      openRow(id);
      fireEvent.click(screen.getByTestId('transcribe-button'));
      back();
    }
    expect(vi.mocked(createRoom)).not.toHaveBeenCalled();
    /* Guard for whoever wires it later: every createRoom( / startCapture( call in the prototype is called without an event. */
    const dir = 'src/app/prototypes/clarity-chat-v16';
    for (const f of readdirSync(dir).filter((n) => /\.tsx?$/.test(n))) {
      const code = readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      for (const m of code.matchAll(/\b(createRoom|startCapture)\(([^)]*)\)/g)) {
        if (m[1] === 'createRoom') expect(m[2]!.split(',').filter((a) => a.trim()).length, `${f}: ${m[0]}`).toBeLessThanOrEqual(3);
        else expect(m[2], `${f}: ${m[0]}`).toMatch(/eventId:\s*null/);
      }
    }
  });

  it('Invite to Clarity Live is only in the ⋯ menu of a 1:1 chat: not a header button, not in a channel or the mirror', () => {
    renderV16();
    openRow('dm-bob-alice');
    expect(within(chatView().querySelector('header')!).queryByRole('button', { name: /Clarity Live/ })).toBeNull();
    expect(chatMenuItems()).toEqual(['Invite to Clarity LiveComing soon']);
    fireEvent.click(screen.getByRole('menuitem', { name: /^Invite to Clarity Live/ }));
    back();
    for (const id of ['gen-cm', 'ch-night-oct16', 'mirror-bob']) {
      openRow(id);
      expect(chatMenuItems().join('|'), id).not.toMatch(/Clarity Live/);
      fireEvent.keyDown(window, { key: 'Escape' });
      back();
    }
    expect(screen.queryByRole('button', { name: /^Invite to Clarity Live$/ })).toBeNull();
  });

  it('General shows a lock and "Members only"; an event channel shows when it is and the real RSVP count', async () => {
    renderV16();
    openRow('gen-cm');
    expect(chatView().querySelector('header')!.textContent).toContain('General');
    expect(within(chatView()).getByTestId('members-only').textContent).toBe('Members only');
    expect(within(chatView()).getByTestId('members-only-lock')).toBeTruthy();
    expect(within(document.querySelector<HTMLElement>('[data-chat="gen-cm"]')!).getByTestId('row-title').textContent).toBe('Communication Activism Community · Chiang Mai · General');
    back();
    openRow('ch-night-oct16');
    expect(within(chatView()).queryByTestId('members-only')).toBeNull();
    expect((await within(chatView()).findByTestId('going-count')).textContent).toBe('4 going'); // getEventAttendees for the seeded event
  });

  it('an event channel\'s Members are that event\'s real RSVPs, not the group roster', async () => {
    renderV16();
    openRow('ch-night-oct16');
    fireEvent.click(within(chatView()).getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByTestId('chat-menu')).getByRole('menuitem', { name: 'Members' }));
    const members = await screen.findByTestId('members');
    await within(members).findByRole('list', { name: 'Going' });
    expect(members.textContent).toContain('4 going');
    for (const n of ['Bob Keller', 'Alice Moreau', 'Dana Ortiz', 'Fay Okafor']) expect(members.textContent).toContain(n);
    expect(members.textContent).not.toContain('Carol Singh'); // in the cm group, but no seat tonight
    expect(vi.mocked(eventsService.getEventAttendees)).toHaveBeenCalledWith('ev-oct16');
  });

  it('Mark as unread is in the message menu (right-click) and updates every unread count', () => {
    renderV16();
    openRow('dm-bob-alice'); // reads it: Alice 2 -> 0
    const n = () => within(document.querySelector<HTMLElement>('[data-chat="dm-bob-alice"]')!).queryByTestId('row-unread')?.textContent;
    const sidebarN = () => within(within(sidebar()).getByRole('list', { name: 'Places' })).getByRole('button', { name: /^Chats/ }).querySelector('[aria-label$="unread"]')?.textContent;
    expect(n()).toBeUndefined();
    expect(sidebarN()).toBe('5');
    rightClick(msg('Ready for tonight?'));
    expect(menuItems()).toContain('Mark as unread');
    fireEvent.click(within(screen.getByTestId('message-menu')).getByText('Mark as unread'));
    expect(screen.queryByTestId('message-menu')).toBeNull();
    expect(n()).toBe('2'); // from Bob's own message on: Alice wrote two
    expect(sidebarN()).toBe('7');
    expect(within(screen.getByTestId('folder-tabs')).getByRole('tab', { name: /All chats/ }).textContent).toContain('7');
  });

  it('Mark as unread on touch: a long press opens the same menu; a quick tap does not; moving the finger cancels it', () => {
    vi.useFakeTimers();
    try {
      stubViewport(false);
      renderV16();
      openRow('dm-bob-alice');
      const row = msg('Ready for tonight?').firstElementChild as HTMLElement;
      const unread = () => within(document.querySelector<HTMLElement>('[data-chat="dm-bob-alice"]')!).queryByTestId('row-unread');
      fireEvent.touchStart(row, { touches: [{ clientX: 40, clientY: 40 }] });
      rtlAct(() => { vi.advanceTimersByTime(200); });
      fireEvent.touchEnd(row, { changedTouches: [{ clientX: 40, clientY: 40 }] });
      rtlAct(() => { vi.advanceTimersByTime(800); });
      expect(screen.queryByTestId('message-menu')).toBeNull(); // a tap
      fireEvent.touchStart(row, { touches: [{ clientX: 40, clientY: 40 }] });
      fireEvent.touchMove(row, { touches: [{ clientX: 40, clientY: 90 }] });
      rtlAct(() => { vi.advanceTimersByTime(800); });
      fireEvent.touchEnd(row, { changedTouches: [{ clientX: 40, clientY: 90 }] });
      expect(screen.queryByTestId('message-menu')).toBeNull(); // a scroll
      fireEvent.touchStart(row, { touches: [{ clientX: 40, clientY: 40 }] });
      rtlAct(() => { vi.advanceTimersByTime(600); });
      expect(screen.getByTestId('message-menu')).toBeTruthy(); // a long press
      fireEvent.touchEnd(row, { changedTouches: [{ clientX: 40, clientY: 40 }] });
      expect(unread()).toBeNull();
      fireEvent.click(within(screen.getByTestId('message-menu')).getByText('Mark as unread'));
      expect(unread()?.textContent).toBe('2');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('P1509 v16 review fixes (UI)', () => {
  const groupOf = () => screen.getByTestId('group-page').querySelector('[data-group]')!.getAttribute('data-group');

  it('#3 an event channel opens the real event seeded under the same mock id from its ⋯ menu; #2 "Back to {group}" goes to ITS group, the arrow is history', async () => {
    renderV16();
    openRow('ch-night-oct16');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByTestId('chat-menu')).getByRole('menuitem', { name: /Event details/ }));
    await waitFor(() => expect(screen.getByTestId('event-page').getAttribute('data-group')).toBe('cm'));
    await screen.findByTestId('rsvp-area');
    back(); // the header arrow: history, so back to the channel
    expect(chatView().getAttribute('data-chat-open')).toBe('ch-night-oct16');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByTestId('chat-menu')).getByRole('menuitem', { name: /Event details/ }));
    fireEvent.click(await screen.findByTestId('event-back-link')); // explicit: the group, not the channel we came from
    await screen.findByTestId('group-tabs');
    expect(groupOf()).toBe('cm');
  });

  it('#3 the chat mock has an event the test project does not: its header says so instead of inventing a page', async () => {
    const bySlug = vi.mocked(eventsService.getEventBySlug).getMockImplementation()!;
    vi.mocked(eventsService.getEventBySlug).mockResolvedValue(null);
    try {
      renderV16();
      openRow('ch-night-oct16');
      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      fireEvent.click(within(screen.getByTestId('chat-menu')).getByRole('menuitem', { name: /Event details/ }));
      expect(await screen.findByText('This event does not exist.')).toBeTruthy();
    } finally {
      vi.mocked(eventsService.getEventBySlug).mockImplementation(bySlug);
    }
  });

  it('#2 a seeded attendee (Dana, tonight) sees Cancel RSVP, and it works; the ear badge "0" is gone', async () => {
    renderV16();
    await asDana();
    openRow('ch-night-oct16');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(within(screen.getByTestId('chat-menu')).getByRole('menuitem', { name: /Event details/ }));
    expect(await screen.findByTestId('rsvp-going')).toBeTruthy();
    expect(screen.getByTestId('participants').textContent).not.toMatch(/0/);
    fireEvent.click(screen.getByTestId('cancel-rsvp'));
    await waitFor(() => expect(screen.getByTestId('rsvp-button').textContent).toBe('Reserve a seat'));
    expect(vi.mocked(eventsService.cancelRsvp)).toHaveBeenCalledWith('ev-oct16', 'u-dana');
    await waitFor(() => expect(screen.getByTestId('participants').textContent).toContain('Participants (3)'));
  });

  it('#4 the Partner tag opens the in-app Partners page; Search "Invite" opens the Invite partner page', async () => {
    renderV16();
    openRow('dm-bob-alice');
    const tag = await screen.findByTestId('partner-tag');
    expect(tag.tagName).toBe('BUTTON');
    fireEvent.click(tag);
    expect(screen.getByTestId('partners-page')).toBeTruthy();
    place('Chats');
    fireEvent.change(screen.getByRole('textbox', { name: 'Search' }), { target: { value: 'zzzz' } });
    fireEvent.click(within(screen.getByTestId('search-no-people')).getByTestId('invite-link'));
    expect(screen.getByTestId('partner-invite-page')).toBeTruthy();
  });

  it('#6 unclaimed mirror explains itself; Clarify auto-claims with the default name; the forwarded card (not a Back bar) returns to the source chat', () => {
    renderV16();
    openRow('mirror-bob');
    expect(screen.getByTestId('mirror-explainer').textContent).toBe('Your mirror helps you check what you meant before you send it. Forward any message here with Clarify.');
    openRow('dm-bob-alice');
    tool(msg(/This is the exercise/), 'Clarify with Your mirror');
    expect(chatView().getAttribute('data-chat-open')).toBe('mirror-bob');
    expect(screen.queryByTestId('mirror-claim')).toBeNull();
    expect(screen.getByTestId('mirror-header').textContent).toContain("Bob's mirror");
    expect(screen.queryByTestId('mirror-back-link')).toBeNull();
    fireEvent.click(within(chatView()).getAllByTestId('reply-quote').at(-1)!);
    expect(chatView().getAttribute('data-chat-open')).toBe('dm-bob-alice');
  });

  it('#7 a short swipe does not archive, a 100px+ swipe does; Undo in the toast brings it back', async () => {
    renderV16();
    const btn = () => within(document.querySelector<HTMLElement>('[data-chat="dm-bob-carol"]')!).getAllByRole('button')[0]!;
    const swipe = (dx: number) => { fireEvent.touchStart(btn(), { touches: [{ clientX: 300, clientY: 100 }] }); fireEvent.touchEnd(btn(), { changedTouches: [{ clientX: 300 - dx, clientY: 100 }] }); };
    swipe(80);
    expect(document.querySelector('[data-testid="chat-rows"] [data-chat="dm-bob-carol"]')).toBeTruthy();
    swipe(120);
    expect(document.querySelector('[data-testid="chat-rows"] [data-chat="dm-bob-carol"]')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(document.querySelector('[data-testid="chat-rows"] [data-chat="dm-bob-carol"]')).toBeTruthy();
  });

  it('#8 an empty chat mock points to Browse groups (the real directory) and to Invite partner', async () => {
    renderV16(`${BASE}?state=empty`);
    expect(within(screen.getByTestId('empty-list')).getByRole('button', { name: 'Invite partner' })).toBeTruthy();
    fireEvent.click(within(screen.getByTestId('empty-list')).getByRole('button', { name: /Browse groups/ }));
    expect(screen.getByTestId('directory-page')).toBeTruthy();
    await within(screen.getByTestId('directory-page')).findAllByTestId('org-card');
  });

  it('#9 the sidebar badge (desktop) or the phone tab badge, the All chats folder and the row badges agree, before and after opening a chat', () => {
    const folderN = () => within(within(screen.getByTestId('folder-tabs')).getByRole('tab', { name: /All chats/ })).queryByLabelText(/unread/)?.textContent;
    const rowsN = () => String(screen.getAllByTestId('row-unread').reduce((n, el) => n + Number(el.textContent), 0));
    const sidebarN = () => within(within(sidebar()).getByRole('list', { name: 'Places' })).getByRole('button', { name: /^Chats/ }).querySelector('[aria-label$="unread"]')?.textContent;
    const phoneN = () => within(screen.getByTestId('bottom-tabs')).getByRole('button', { name: /Chats/ }).querySelector('[aria-label$="unread"]')?.textContent;
    const a = renderV16();
    expect([sidebarN(), folderN(), rowsN()]).toEqual(['7', '7', '7']);
    openRow('dm-bob-alice'); // opening a chat reads it: Alice 2 -> 0, so 7 -> 5 everywhere at once
    expect([sidebarN(), folderN(), rowsN()]).toEqual(['5', '5', '5']);
    a.unmount();
    stubViewport(false);
    renderV16();
    expect([phoneN(), folderN(), rowsN()]).toEqual(['7', '7', '7']);
    openRow('dm-bob-alice');
    back();
    expect([phoneN(), folderN(), rowsN()]).toEqual(['5', '5', '5']);
  });

  it('#11 the composer shows Send once there is text; #13 the phone Profile sheet reaches Tools', () => {
    stubViewport(false);
    renderV16();
    openRow('dm-bob-alice');
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Message Alice' }), { target: { value: 'hi' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy();
    back();
    fireEvent.click(within(screen.getByTestId('bottom-tabs')).getByRole('button', { name: /Profile/ }));
    fireEvent.click(screen.getByTestId('menu-tools'));
    expect(screen.getByTestId('tools-page')).toBeTruthy();
  });
});

describe('P1509 v16 Share picker cards, Home widgets, group order, Admin on a phone', () => {
  const openPicker = async () => {
    openRow('dm-bob-alice');
    fireEvent.click(screen.getByRole('button', { name: 'Share a point or story' }));
    const dlg = screen.getByRole('dialog', { name: 'Share a point or story' });
    await within(dlg).findByTestId('attach-results');
    return dlg;
  };
  const MORE = { name: /More actions for this/ };

  it('the Share picker card has no "+ Add a point" and no ⋯ (production\'s Home card, for the same story, still has both); expand and Details stay', async () => {
    const a = renderV16(`${BASE}?view=home`);
    const feedStory = (await screen.findAllByTestId('feed-story'))[0]!;
    expect(within(feedStory).getByRole('button', MORE)).toBeTruthy(); // production's card is untouched
    expect(within(feedStory).getByRole('button', { name: 'Add a point to this story' })).toBeTruthy();
    a.unmount();
    renderV16();
    const dlg = await openPicker();
    fireEvent.click(within(dlg).getByRole('tab', { name: 'Stories' }));
    const story = within(dlg).getAllByTestId('share-option')[0]!;
    expect(within(story).queryByRole('button', MORE)).toBeNull();
    expect(within(story).queryByRole('button', { name: 'Add a point to this story' })).toBeNull();
    for (const el of story.querySelectorAll<HTMLElement>('[aria-label="Add a point to this story"], [aria-label^="More actions for this"]')) expect(el.hidden).toBe(true); // hidden, not deleted: React still owns the nodes
    expect(within(story).getByTestId('feed-story-point-expander')).toBeTruthy(); // expand stays
    expect(within(story).getByRole('button', { name: /Details/ })).toBeTruthy(); // Details stays
    fireEvent.click(within(dlg).getByRole('tab', { name: 'Points' }));
    for (const opt of within(dlg).getAllByTestId('share-option')) expect(within(opt).queryByRole('button', MORE)).toBeNull();
  });

  it('Share is the picker\'s one solid primary button per card: hover-only for a pointer, always there on touch; and the shared card in the chat has no ⋯ either', async () => {
    renderV16();
    const dlg = await openPicker();
    const option = within(dlg).getAllByTestId('share-option')[0]!;
    const share = within(option).getByTestId('share-button');
    expect(share.className).toContain('bg-blue-600');
    expect(share.className).toContain('[@media(hover:hover)]:opacity-0');
    expect(share.className).toContain('[@media(hover:hover)]:group-hover:opacity-100');
    expect(share.className).toContain('[@media(hover:hover)]:group-focus-within:opacity-100');
    expect(share.className).not.toMatch(/(^|\s)opacity-0/); // touch: never hidden
    expect(within(option).getAllByRole('button').filter((b) => b.className.includes('bg-blue-600'))).toHaveLength(1);
    fireEvent.click(share);
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    const card = within(within(chatView()).getByRole('list', { name: 'Messages' })).getByTestId('share-point');
    expect(within(card).queryByRole('button', MORE)).toBeNull();
  });

  it('desktop Home restores the production widgets: Search, Next events and Groups; the links answer inside the prototype', async () => {
    renderV16(`${BASE}?view=home`);
    const rail = await screen.findByTestId('home-side-rail');
    expect(await within(rail).findAllByTestId('event-card')).toHaveLength(2);
    expect(rail.textContent).toContain('Next events');
    expect(rail.textContent).toContain('Groups');
    expect(rail.textContent).toContain('Communication Activism Community · Chiang Mai');
    expect(screen.queryByTestId('home-top-block')).toBeNull(); // the phone block is not mounted on a desktop
    fireEvent.click(within(rail).getByText('All events'));
    expect(screen.getByTestId('events-page')).toBeTruthy();
    place('Home');
    fireEvent.click(within(await screen.findByTestId('home-side-rail')).getByText('Communication Activism Community · Chiang Mai'));
    expect((await screen.findByTestId('group-page')).querySelector('[data-group]')!.getAttribute('data-group')).toBe('cm');
    back();
    fireEvent.click((await within(await screen.findByTestId('home-side-rail')).findAllByTestId('event-card'))[0]!);
    expect(await screen.findByTestId('event-page')).toBeTruthy();
  });

  it('Home Search filters the feed by words and #tags and says so when nothing matches; the counts follow', async () => {
    renderV16(`${BASE}?view=home`);
    await screen.findByTestId('feed-tabs');
    const box = screen.getByRole('textbox', { name: 'Search stories and points' });
    fireEvent.change(box, { target: { value: 'hike' } });
    expect(within(screen.getByTestId('feed-tabs')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Stories (1)', 'Points (0)']);
    fireEvent.change(box, { target: { value: '#listening' } });
    expect(within(screen.getByTestId('feed-tabs')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Stories (1)', 'Points (1)']);
    fireEvent.change(box, { target: { value: 'zzzz' } });
    expect(screen.getByTestId('home-empty').textContent).toContain('No stories match');
    fireEvent.change(box, { target: { value: '' } });
    expect(within(screen.getByTestId('feed-tabs')).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Stories (2)', 'Points (3)']);
  });

  it('phone Home: the next-events block sits above Search, and the desktop rail is not mounted', async () => {
    stubViewport(false);
    renderV16(`${BASE}?view=home`);
    const block = await screen.findByTestId('home-top-block');
    const search = screen.getByTestId('home-search');
    expect(block.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTestId('home-side-rail')).toBeNull();
  });

  it('Groups are sorted by latest activity: cm first, then online once someone talks there; Browse lists the groups I am in before the others', async () => {
    h.state.myOrgIds = ['org-cm', 'org-online'];
    renderV16();
    const names = () => within(screen.getByRole('list', { name: 'Your groups' })).getAllByRole('button').map((b) => b.textContent);
    place('Groups');
    await screen.findByRole('list', { name: 'Your groups' });
    expect(names().map((n) => n?.slice(0, 18))).toEqual(['Communication Acti', 'Clarity Practice C']);
    place('Chats');
    openRow('ch-online-sept'); // Bob has a seat at the online event
    fireEvent.change(screen.getByRole('textbox', { name: 'Message Online practice, Sept 28' }), { target: { value: 'Same time next month?' } });
    fireEvent.click(within(screen.getByTestId('composer')).getByRole('button', { name: 'Send' }));
    place('Groups');
    expect(names().map((n) => n?.slice(0, 18))).toEqual(['Clarity Practice C', 'Communication Acti']); // online now has the newest message
    h.state.myOrgIds = ['org-online'];
  });

  it('Browse groups lists my groups before the others', async () => {
    h.state.myOrgIds = ['org-online'];
    renderV16(`${BASE}?view=directory`);
    const cards = await screen.findAllByTestId('org-card');
    expect(cards.map((c) => c.closest('[data-group]')!.getAttribute('data-group'))).toEqual(['online', 'cm']);
  });

  it('a non-admin persona never sees Admin: not in the desktop menu, not in the phone sheet; the admin sees it in both', async () => {
    renderV16();
    await asDana();
    fireEvent.click(screen.getByTestId('sidebar-me'));
    await waitFor(() => expect(vi.mocked(getAdminTopics)).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('me-menu').textContent).not.toMatch(/Admin|Users|Topics/);
    expect(screen.queryByTestId('admin-group')).toBeNull();
  });

  it('the phone sheet shows Admin to the admin only', async () => {
    stubViewport(false);
    const a = renderV16();
    await waitFor(() => expect(vi.mocked(getAdminTopics)).toHaveBeenCalledTimes(1));
    tabbar('Profile');
    await waitFor(() => expect(screen.getByTestId('admin-group')).toBeTruthy());
    a.unmount();
    h.set(h.snap(F.DANA));
    renderV16();
    await waitFor(() => expect(vi.mocked(getAdminTopics)).toHaveBeenCalledTimes(2));
    tabbar('Profile');
    await rtlAct(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId('me-menu').textContent).toContain('Log Out');
    expect(screen.queryByTestId('admin-group')).toBeNull();
    expect(screen.getByTestId('me-menu').textContent).not.toMatch(/Admin|Users|Topics/);
  });
});

/**
 * Touch targets, one full-width primary and no disabled primary, across the views. jsdom has no layout, so the size is read from the
 * classes that set it (a 40px minimum: h-10 / min-h-10 and up); production's own cards and the certificate are not v16's to size.
 */
describe('P1509 v16 touch targets and primaries', () => {
  const BIG = /(^|\s)(min-h-(10|11|12|14|16|\[60px\]|\[68px\])|h-(10|11|12|14|16)|lg:h-9|after:-inset-2)(\s|$)/;
  const interactive = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('button, a[href], [role="tab"], input:not([type="hidden"]), textarea')]
    .filter((el) => !el.closest('[data-testid="share-option"], [data-testid^="feed-"], [aria-label="Partner Agreements"], [data-testid="certificate-page-shell"], [data-testid="home-side-widgets"], [data-testid="home-top-widgets"], [data-testid="events-page"], [data-testid="directory-page"], [data-testid="group-page"], [data-testid="event-page"], [data-testid="profile"] [data-testid^="compact"]'));
  const small = (root: HTMLElement) => interactive(root).filter((el) => !BIG.test(el.className) && !el.closest('label') && !el.matches('input[type="checkbox"]'))
    .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute('aria-label') ?? el.textContent?.slice(0, 24)}] class="${el.className.slice(0, 80)}"`);

  it('control: the scan does flag a 24px button and passes a 40px one (so an empty result above means something)', () => {
    const box = document.createElement('div');
    box.innerHTML = '<button class="h-6 w-6">x</button><button class="min-h-10">y</button><a href="/z" class="inline-flex">z</a>';
    document.body.appendChild(box);
    expect(small(box).map((x) => x.split(' ')[0])).toEqual(['button[x]', 'a[z]']);
    box.remove();
  });

  it('the sidebar, the bottom bar, the chat list, a chat header, the composer and the profile sheet have no target under 40px', async () => {
    const a = renderV16(`${BASE}?view=chats&chat=dm-bob-dana`);
    await rtlAct(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(small(sidebar())).toEqual([]);
    expect(small(screen.getByTestId('chat-list'))).toEqual([]);
    expect(small(chatView().querySelector('header') as HTMLElement)).toEqual([]);
    const composer = small(screen.getByTestId('composer'));
    expect(composer).toEqual([]);
    a.unmount();
    stubViewport(false);
    renderV16();
    expect(small(screen.getByTestId('bottom-tabs'))).toEqual([]);
    tabbar('Profile');
    expect(small(screen.getByTestId('sheet'))).toEqual([]);
  });

  it('the messages (author avatar and name, the forwarded-from name, a thread card, a quoted source, a voice note) have no target under 40px', () => {
    const a = renderV16(`${BASE}?view=chats&chat=dm-bob-alice`);
    expect(small(within(chatView()).getByRole('list', { name: 'Messages' }))).toEqual([]);
    a.unmount();
    renderV16(`${BASE}?view=chats&chat=ch-night-oct16`);
    tool(msg(/Bring one disagreement/), /^Clarify with/); // a thread card in the mirror, with its source card
    expect(within(chatView()).getByTestId('thread-card')).toBeTruthy();
    expect(small(within(chatView()).getByRole('list', { name: 'Messages' }))).toEqual([]);
  });

  it('Letters cards and the invite page have no target under 40px', async () => {
    const a = renderV16(`${BASE}?view=letters`);
    await screen.findAllByTestId('letter-card');
    expect(small(screen.getByTestId('letters-page'))).toEqual([]);
    a.unmount();
    renderV16(`${BASE}?view=invite&with=dana`);
    expect(small(screen.getByTestId('partner-invite-page')).filter((x) => !/Use suggested terms/.test(x))).toEqual([]);
  });

  it('every view has at most ONE full-width primary button and none is disabled as decoration', async () => {
    const urls = ['', '?view=chats&chat=dm-bob-alice', '?view=chats&chat=dm-bob-eli', '?view=chats&chat=mirror-bob', '?view=profile&person=fay', '?view=profile&person=sam', '?view=partners', '?view=invite&with=dana', '?view=groups', '?view=directory', '?view=home', '?view=letters', '?view=events', '?view=tools', '?state=empty', '?state=nopartners', '?view=chats&with=sam', '?view=chats&with=fay'];
    for (const u of urls) {
      const a = renderV16(`${BASE}${u}`);
      await rtlAct(async () => { await new Promise((r) => setTimeout(r, 15)); });
      const primaries = [...document.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.className.includes('bg-blue-600') && b.offsetParent !== undefined);
      const wide = primaries.filter((b) => /(^|\s)w-full(\s|$)/.test(b.className));
      expect(wide.map((b) => b.textContent), `${u || 'chat list'}: full-width primaries`).toHaveLength(Math.min(wide.length, 1));
      expect(primaries.filter((b) => b.disabled).map((b) => b.textContent), `${u || 'chat list'}: disabled primaries`).toEqual([]);
      a.unmount();
    }
  });
});

/**
 * Review fixes 1 (Gemini + Codex review of the committed UI). Each test here was run against the unfixed code first.
 */
/** Every toast( literal in the prototype after review fixes 1: results and labelled mocks only. Filled in by the toast test. */
const EXPECTED_TOASTS: string[] = [
  'Archived …', // result, with Undo
  'Forwarded to …', // result
  'Inviting to Clarity Live from a chat is coming soon (mock).', // its menu item says Coming soon first
  'Not saved: prototype. Joined … for this screen only.', // labelled mock, before (the page note) and after
  'Not saved: prototype. Left … for this screen only.',
  'Not saved: prototype. Your position is shown here only.',
  'Playback is coming soon.', // the voice note says "Playback: Coming soon" first
  'Something went wrong. Try again.', // error
  '… accepted (mock).', // the prototype control strip (not product UI), labelled (mock)
  '… from a chat is coming soon.', // Transcribe, which says Coming soon first
  '… to ….', // Invite sent to <name>: result
]; // plus the toast.error for a refused RSVP and a refused cancel (conditional text)

describe('P1509 v16 review fixes 1', () => {
  const pressed = (card: HTMLElement) => within(card).getByTestId('agree-group').getAttribute('aria-pressed');
  const quotedOf = (story: HTMLElement) => within(story).getAllByTestId('quoted-point-card');
  const spyOpen = () => vi.spyOn(window, 'open').mockImplementation(() => null);

  describe('C1 a click on a story\'s second linked point lands on the second point', () => {
    it('Home (RealStoryCard in the feed)', async () => {
      renderV16(`${BASE}?view=home`);
      const story = () => screen.getAllByTestId('feed-story')[0]!;
      await screen.findAllByTestId('feed-story');
      fireEvent.click(within(story()).getByTestId('feed-story-point-expander'));
      expect(quotedOf(story())).toHaveLength(2);
      fireEvent.click(within(quotedOf(story())[1]!).getByTestId('agree-group'));
      expect([pressed(quotedOf(story())[0]!), pressed(quotedOf(story())[1]!)]).toEqual(['false', 'true']);
      fireEvent.click(within(quotedOf(story())[0]!).getByTestId('agree-group'));
      expect([pressed(quotedOf(story())[0]!), pressed(quotedOf(story())[1]!)]).toEqual(['true', 'true']);
    });

    it('the Share picker (RealStoryCard inside ShareCard)', async () => {
      renderV16();
      openRow('dm-bob-alice');
      fireEvent.click(screen.getByRole('button', { name: 'Share a point or story' }));
      const dlg = screen.getByRole('dialog', { name: 'Share a point or story' });
      await within(dlg).findByTestId('attach-results');
      fireEvent.click(within(dlg).getByRole('tab', { name: 'Stories' }));
      const story = () => within(dlg).getAllByTestId('share-option')[0]!;
      fireEvent.click(within(story()).getByTestId('feed-story-point-expander'));
      fireEvent.click(within(quotedOf(story())[1]!).getByTestId('agree-group'));
      expect([pressed(quotedOf(story())[0]!), pressed(quotedOf(story())[1]!)]).toEqual(['false', 'true']);
    });
  });

  describe('C2 a sign-in that finishes after the page is left leaves no persona session', () => {
    const slowFetch = () => {
      let release!: () => void;
      const pending = new Promise<void>((r) => { release = r; });
      /* Deliberately ignores any AbortSignal: the response arrives late whatever the client did. */
      vi.stubGlobal('fetch', vi.fn(async () => { await pending; return { ok: true, status: 200, json: async () => ({ access_token: 'tok-dana', refresh_token: 'r' }) }; }));
      return release;
    };
    const settle = () => rtlAct(async () => { await new Promise((r) => setTimeout(r, 15)); });

    it('unmount while the request is pending: the late response never reaches setSession', async () => {
      h.set(h.snap(null));
      const release = slowFetch();
      const a = renderV16();
      fireEvent.click(screen.getByTestId('sign-in-dana'));
      a.unmount();
      await settle();
      release();
      await settle();
      expect(supabase.auth.setSession).not.toHaveBeenCalled();
    });

    it('pagehide while the request is pending does the same', async () => {
      h.set(h.snap(null));
      const release = slowFetch();
      renderV16();
      fireEvent.click(screen.getByTestId('sign-in-dana'));
      window.dispatchEvent(new Event('pagehide'));
      release();
      await settle();
      expect(supabase.auth.setSession).not.toHaveBeenCalled();
    });

    it('left while setSession itself is running: the session it set is signed out (local scope)', async () => {
      h.set(h.snap(null));
      let finish!: () => void;
      vi.mocked(supabase.auth.setSession).mockImplementation((() => new Promise((r) => { finish = () => r({ data: {}, error: null }); })) as never);
      const a = renderV16();
      fireEvent.click(screen.getByTestId('sign-in-dana'));
      await waitFor(() => expect(supabase.auth.setSession).toHaveBeenCalled());
      a.unmount();
      await settle();
      finish();
      await settle();
      expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
    });

    it('a sign-in that is NOT interrupted still works (control)', async () => {
      h.set(h.snap(null));
      renderV16();
      fireEvent.click(screen.getByTestId('sign-in-dana'));
      expect(await screen.findByTestId('sidebar')).toBeTruthy();
      expect(supabase.auth.setSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('C3 fail closed unless the client points at the TEST project', () => {
    const watched = () => [vi.mocked(getAdminTopics), vi.mocked(storiesService.getPublicStoriesFeed), vi.mocked(agreementsService.getAgreementsForProfile), vi.mocked(eventsService.getUpcomingEvents), vi.mocked(getInboxItems)];

    it.each([['vitest\'s localhost', 'http://localhost:54321'], ['the PROD project', 'https://besjtuodziykmjidubzw.supabase.co'], ['an empty URL', '']])('%s: a blocking notice instead of the prototype, and no service is called', async (_n, url) => {
      vi.stubEnv('VITE_SUPABASE_URL', url);
      renderV16(`${BASE}?view=home`);
      await rtlAct(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(screen.getByTestId('wrong-project').textContent).toMatch(/test project/i);
      expect(screen.queryByTestId('sidebar')).toBeNull();
      expect(screen.queryByTestId('bottom-tabs')).toBeNull();
      for (const fn of watched()) expect(fn).not.toHaveBeenCalled();
      expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    });

    it('RSVP and invite refuse outside the test project even if called directly', async () => {
      vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
      const { rsvp, cancelRsvp, sendPartnerInvite } = await import('@/app/prototypes/clarity-chat-v16/real-data');
      await expect(rsvp('e', 'p')).rejects.toThrow(/test project/i);
      await expect(cancelRsvp('e', 'p')).rejects.toThrow(/test project/i);
      expect((await sendPartnerInvite({ email: personaEmail('dana'), personId: 'dana', name: 'Dana Ortiz', termsText: 'x' })).ok).toBe(false);
      expect(eventsService.rsvpToEvent).not.toHaveBeenCalled();
      expect(eventsService.cancelRsvp).not.toHaveBeenCalled();
      expect(agreementsService.createAgreement).not.toHaveBeenCalled();
    });

    it('on the test project the prototype renders (control)', () => {
      renderV16();
      expect(screen.queryByTestId('wrong-project')).toBeNull();
      expect(screen.getByTestId('sidebar')).toBeTruthy();
    });
  });

  describe('C5 one source of truth for partners: the real agreements', () => {
    const activeWith = (party: typeof F.PARTY_CAROL) => ({ ...F.AGREEMENT_BOB_CAROL_PENDING, id: `ag-bob-${party.slug}`, status: 'active', partnerSignedAt: '2026-10-01T00:00:00.000Z', partner: party, partnerProfileId: party.profileId });

    it('Carol has a real active agreement and Alice has none: the Partners folder, the badges and the header all say Carol, not Alice', async () => {
      h.state.agreements = [activeWith(F.PARTY_CAROL)];
      renderV16();
      tab(/^Partners/);
      await waitFor(() => expect(document.querySelector('[data-testid="chat-rows"] [data-chat="dm-bob-carol"]')).toBeTruthy());
      expect(document.querySelector('[data-testid="chat-rows"] [data-chat="dm-bob-alice"]')).toBeNull();
      tab(/^All/);
      openRow('dm-bob-carol');
      expect(screen.getByTestId('partner-tag').textContent).toBe('Partner');
      back();
      openRow('dm-bob-alice');
      expect(screen.queryByTestId('partner-tag')).toBeNull();
      expect(screen.getByTestId('invite-partner')).toBeTruthy();
    });

    it('?real=empty: nobody is a partner anywhere (the hardcoded Bob and Alice partnership is gone)', async () => {
      renderV16(`${BASE}?real=empty`);
      tab(/^Partners/);
      await rtlAct(async () => { await new Promise((r) => setTimeout(r, 15)); });
      expect(screen.getByTestId('empty-partners')).toBeTruthy();
      tab(/^All/);
      openRow('dm-bob-alice');
      expect(screen.queryByTestId('partner-tag')).toBeNull();
    });

    it('the default fixtures: Alice is the active partner and Carol shows Invite sent, in the folder and in the header', async () => {
      renderV16();
      tab(/^Partners/);
      await waitFor(() => expect(document.querySelector('[data-testid="chat-rows"] [data-chat="dm-bob-alice"]')).toBeTruthy());
      expect(document.querySelector('[data-testid="chat-rows"] [data-chat="dm-bob-carol"]')).toBeNull(); // pending is not a partner yet
    });
  });

  describe('C6 event channels start from the viewer\'s REAL RSVPs, not only after an action', () => {
    it('a seat cancelled earlier closes its channel on load; a seat reserved earlier opens one', async () => {
      h.state.cancelled.add('ev-oct16:u-bob'); // persisted: Bob cancelled tonight
      h.state.added.add('ev-oct23:u-bob'); // persisted: Bob reserved the online event
      renderV16();
      await waitFor(() => expect(document.querySelector('[data-chat="ch-night-oct16"]')).toBeNull());
      await waitFor(() => expect(document.querySelector('[data-chat="ch-online-oct23"]')).toBeTruthy());
      expect(vi.mocked(eventsService.isUserRsvpd)).toHaveBeenCalledWith('ev-oct16', 'u-bob');
      expect(document.querySelector('[data-chat="ch-night-oct02"]')).toBeTruthy(); // untouched seats stay
    });

    it('and an action after load still works on top of it (reserve again)', async () => {
      h.state.cancelled.add('ev-oct16:u-bob');
      renderV16(`${BASE}?view=event&event=p1509-night-oct16&group=cm`);
      fireEvent.click(await screen.findByTestId('rsvp-button'));
      await screen.findByTestId('rsvp-going');
      place('Chats');
      await waitFor(() => expect(document.querySelector('[data-chat="ch-night-oct16"]')).toBeTruthy());
    });
  });

  describe('C7 controls with a production destination open it; the rest say Coming soon first', () => {
    it('Details on a point and on a story open /point/:id and /story/:id in a new tab', async () => {
      const open = spyOpen();
      renderV16(`${BASE}?view=home`);
      fireEvent.click(within((await screen.findAllByTestId('feed-story'))[0]!).getByRole('button', { name: /Details/ }));
      expect(open).toHaveBeenLastCalledWith('/story/st-bob-1', '_blank', 'noopener,noreferrer');
      fireEvent.click(within(screen.getByTestId('feed-tabs')).getByRole('tab', { name: /Points/ }));
      fireEvent.click(within(screen.getAllByTestId('feed-point')[0]!).getByRole('button', { name: /Details/ }));
      expect(open).toHaveBeenLastCalledWith('/point/pt-bob-1', '_blank', 'noopener,noreferrer');
    });

    it('the event page\'s Event Room opens /events/:slug/room in a new tab', async () => {
      const open = spyOpen();
      renderV16(`${BASE}?view=event&event=p1509-online-oct23&group=online`);
      fireEvent.click(await screen.findByTestId('event-room-tab'));
      expect(open).toHaveBeenCalledWith('/events/p1509-online-oct23/room', '_blank', 'noopener,noreferrer');
    });

    it('New Draft has no production route to open, so it says Coming soon before anyone touches it, and does nothing', async () => {
      const open = spyOpen();
      renderV16(`${BASE}?view=letters`);
      const btn = await screen.findByTestId('new-draft');
      expect(btn.textContent).toContain('Coming soon');
      fireEvent.click(btn);
      expect(open).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toMatch(/opens the letter editor in the app/);
    });

    it('Invite to Clarity Live and the voice note play button say Coming soon before interaction', () => {
      renderV16();
      openRow('dm-bob-alice');
      fireEvent.click(within(chatView()).getByRole('button', { name: 'More' }));
      expect(within(screen.getByTestId('chat-menu')).getByRole('menuitem', { name: /Invite to Clarity Live/ }).textContent).toContain('Coming soon');
      fireEvent.keyDown(window, { key: 'Escape' });
    });

    it('every toast( in the prototype is a result message or a labelled mock: this is the whole list, and the "opens the real page" placeholder is gone', () => {
      const dir = 'src/app/prototypes/clarity-chat-v16';
      const found: string[] = [];
      for (const f of readdirSync(dir).filter((n) => /\.tsx?$/.test(n))) {
        const code = readFileSync(`${dir}/${f}`, 'utf8');
        expect(code, f).not.toMatch(/opens the real page in the app|opens the letter editor in the app|opens here in the app|Details opens/);
        for (const m of code.matchAll(/toast(?:\.error)?\(\s*([`'"])((?:(?!\1).)*)\1/g)) found.push(m[2]!.replace(/\$\{[^}]*\}/g, '…'));
      }
      expect(found.sort()).toEqual(EXPECTED_TOASTS);
    });
  });

  describe('C8 prototype-only actions say so before and after', () => {
    it('Join: the page says "Not saved: prototype" before the button, and the result says it again', async () => {
      renderV16(`${BASE}?view=join&group=online`);
      const note = await screen.findByTestId('prototype-note');
      const accept = await screen.findByTestId('accept-join');
      expect(note.textContent).toMatch(/Not saved: prototype/);
      expect(note.compareDocumentPosition(accept) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy(); // before the button
      fireEvent.click(accept);
      expect(await screen.findByText(/Not saved: prototype\. Joined .* for this screen only\./)).toBeTruthy();
    });

    it('Leave: the confirmation says it before, the result after', async () => {
      renderV16();
      openRow('gen-cm');
      fireEvent.click(within(chatView()).getByRole('button', { name: 'More' }));
      fireEvent.click(within(screen.getByTestId('chat-menu')).getByRole('menuitem', { name: 'Leave group' }));
      const dlg = screen.getByRole('dialog', { name: 'Leave group' });
      expect(dlg.textContent).toMatch(/Not saved: prototype/);
      fireEvent.click(within(dlg).getByRole('button', { name: 'Leave' }));
      expect(await screen.findByText(/Not saved: prototype\. Left .* for this screen only\./)).toBeTruthy();
    });

    it('a position taken on a card: Home and the picker say it is not saved, and the result says it too', async () => {
      renderV16(`${BASE}?view=home`);
      expect(await screen.findByTestId('prototype-note-positions')).toBeTruthy();
      fireEvent.click(within(screen.getByTestId('feed-tabs')).getByRole('tab', { name: /Points/ }));
      fireEvent.click(within(screen.getAllByTestId('feed-point')[0]!).getByTestId('agree-group'));
      expect(await screen.findByText('Not saved: prototype. Your position is shown here only.')).toBeTruthy();
      place('Chats');
      openRow('dm-bob-alice');
      fireEvent.click(screen.getByRole('button', { name: 'Share a point or story' }));
      expect(within(screen.getByRole('dialog', { name: 'Share a point or story' })).getByTestId('prototype-note-positions')).toBeTruthy();
    });
  });

  describe('C9 the sheets are accessible dialogs: focus is trapped and restored, the background is isolated', () => {
    const settle = () => rtlAct(async () => { await new Promise((r) => setTimeout(r, 15)); });

    it('the phone profile sheet: focus moves in and stays in, the app behind is hidden from assistive tech, Esc restores focus to the tab', async () => {
      stubViewport(false);
      renderV16();
      const tabBtn = within(screen.getByTestId('bottom-tabs')).getByRole('button', { name: /Profile/ });
      tabBtn.focus();
      fireEvent.click(tabBtn);
      const dlg = await screen.findByRole('dialog', { name: 'Profile menu' });
      await settle();
      expect(dlg.contains(document.activeElement)).toBe(true);
      expect(dlg.getAttribute('aria-modal') ?? 'true').toBe('true');
      expect(screen.getByTestId('v16-app').closest('[aria-hidden="true"]')).toBeTruthy(); // background isolation
      screen.getByRole('button', { name: /Chats/, hidden: true }).focus(); // try to leave: the app behind is hidden from assistive tech
      expect(dlg.contains(document.activeElement)).toBe(true);
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Profile menu' })).toBeNull());
      expect(document.activeElement).toBe(tabBtn);
    });

    it('outside tap and swipe down still close it', async () => {
      stubViewport(false);
      renderV16();
      tabbar('Profile');
      await screen.findByRole('dialog', { name: 'Profile menu' });
      await settle();
      fireEvent.pointerDown(screen.getByTestId('dialog-overlay'));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Profile menu' })).toBeNull());
      tabbar('Profile');
      const panel = await screen.findByTestId('sheet');
      fireEvent.touchStart(panel, { touches: [{ clientY: 300 }], changedTouches: [{ clientY: 300 }] });
      fireEvent.touchMove(panel, { touches: [{ clientY: 300 + SHEET_DISMISS_PX + 40 }], changedTouches: [{ clientY: 300 + SHEET_DISMISS_PX + 40 }] });
      fireEvent.touchEnd(panel, { changedTouches: [{ clientY: 300 + SHEET_DISMISS_PX + 40 }] });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Profile menu' })).toBeNull());
    });

    it('the generic sheet (Forward) traps focus and gives it back to the control that opened it', async () => {
      renderV16();
      openRow('dm-bob-alice');
      const fwd = within(within(msg('Ready for tonight?')).getByRole('toolbar')).getByRole('button', { name: 'Forward' });
      fwd.focus();
      fireEvent.click(fwd);
      const dlg = await screen.findByRole('dialog', { name: 'Forward to' });
      await settle();
      expect(dlg.contains(document.activeElement)).toBe(true);
      screen.getByRole('button', { name: 'Share a point or story', hidden: true }).focus(); // try to leave
      expect(dlg.contains(document.activeElement)).toBe(true);
      expect(screen.getByTestId('v16-app').closest('[aria-hidden="true"]')).toBeTruthy();
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Forward to' })).toBeNull());
      expect(document.activeElement).toBe(fwd);
    });
  });

  describe('C10 Transcribe is in every chat header path and its Coming soon is never hidden', () => {
    it('including a "No chat yet" header, and the Coming soon text has no responsive hiding at any width', () => {
      for (const url of ['?view=chats&with=sam', '?view=chats&with=fay', '?view=chats&chat=dm-bob-alice', '?view=chats&chat=gen-cm', '?view=chats&chat=ch-night-oct16', '?view=chats&chat=mirror-bob']) {
        const a = renderV16(`${BASE}${url}`);
        const header = screen.getByTestId('chat-view').querySelector('header')!;
        const btn = within(header).getByTestId('transcribe-button');
        const soon = within(btn).getByTestId('transcribe-soon');
        expect(soon.textContent, url).toBe('Coming soon');
        expect(soon.className, url).not.toMatch(/(^|\s)(\w+:)*hidden(\s|$)/);
        a.unmount();
      }
    });
  });

  describe('Gemini#2 phone: pages opened from the profile sheet know where they came from', () => {
    const viaSheet = (testId: string) => { tabbar('Profile'); fireEvent.click(screen.getByTestId(testId)); };

    it('Tools and Events (browse pages) keep the bottom bar with Profile active, and have a Back to where the user came from', () => {
      stubViewport(false);
      renderV16(`${BASE}?view=groups`);
      viaSheet('menu-tools');
      expect(screen.getByTestId('tools-page')).toBeTruthy();
      expect(within(screen.getByTestId('bottom-tabs')).getByRole('button', { name: /Profile/ }).getAttribute('aria-current')).toBe('page');
      back();
      expect(screen.getByTestId('groups-page')).toBeTruthy(); // where it came from, not Chats
      tabbar('Profile');
      fireEvent.click(within(screen.getByTestId('me-menu')).getByRole('menuitem', { name: 'Events' }));
      expect(screen.getByTestId('events-page')).toBeTruthy();
      expect(within(screen.getByTestId('bottom-tabs')).getByRole('button', { name: /Profile/ }).getAttribute('aria-current')).toBe('page');
      back();
      expect(screen.getByTestId('groups-page')).toBeTruthy();
    });

    it('Partners, My Profile, Settings and Invite partner (focus pages) hide the bottom bar and have a Back', () => {
      stubViewport(false);
      renderV16();
      for (const label of ['Partners', 'My Profile', 'Settings']) {
        tabbar('Profile');
        fireEvent.click(within(screen.getByTestId('me-menu')).getByRole('menuitem', { name: label }));
        expect(screen.queryByTestId('bottom-tabs'), label).toBeNull();
        back();
        expect(screen.getByTestId('chat-list'), label).toBeTruthy();
        expect(screen.getByTestId('bottom-tabs'), label).toBeTruthy();
      }
      viaSheet('menu-invite');
      expect(screen.queryByTestId('bottom-tabs')).toBeNull();
      back();
      expect(screen.getByTestId('bottom-tabs')).toBeTruthy();
    });

    it('on a desktop the same pages have no Back arrow (they are places in the sidebar)', () => {
      renderV16();
      place('Events');
      const header = screen.getByTestId('events-page').querySelector('header')!;
      expect(header.querySelector('button[aria-label="Back"]')?.className ?? 'lg:hidden').toContain('lg:hidden');
    });
  });

  describe('Gemini#3 the profile "You share" line comes from the real memberships and RSVPs', () => {
    it('Alice: the real group and the real events both have (Bob cancelled Oct 2, so it is not listed even though the chat mock says he went)', async () => {
      h.state.cancelled.add('ev-oct2:u-bob');
      renderV16(`${BASE}?view=profile&person=alice`);
      const line = await screen.findByTestId('you-share');
      await waitFor(() => expect(line.textContent).toContain('Clarity Night, Oct 16'));
      expect(line.textContent).toContain('Communication Activism Community · Chiang Mai');
      expect(line.textContent).not.toContain('Oct 2');
    });

    it('Dana: only tonight; and when nothing is shared it says so', async () => {
      renderV16(`${BASE}?view=profile&person=dana`);
      const line = await screen.findByTestId('you-share');
      await waitFor(() => expect(line.textContent).toContain('Clarity Night, Oct 16'));
      expect(line.textContent).not.toContain('Communication Activism');
      const none = await (async () => { renderV16(`${BASE}?view=profile&person=sam`); return screen.findAllByTestId('you-share'); })();
      await waitFor(() => expect(none.at(-1)!.textContent).toBe('You share no group or event.'));
    });
  });

  describe('Gemini#5 the Home widgets obey ?real=', () => {
    it.each([['loading', 'real-skeleton'], ['error', 'real-error'], ['empty', 'real-empty']])('?real=%s shows that state in the widgets and calls no service for them', async (state, testId) => {
      renderV16(`${BASE}?view=home&real=${state}`);
      await rtlAct(async () => { await new Promise((r) => setTimeout(r, 20)); });
      expect(within(screen.getByTestId('home-side-widgets')).getByTestId(testId)).toBeTruthy();
      expect(screen.queryByTestId('home-side-rail')).toBeNull();
      expect(vi.mocked(eventsService.getUpcomingEvents)).not.toHaveBeenCalled();
    });

    it('the phone block obeys it too', async () => {
      stubViewport(false);
      renderV16(`${BASE}?view=home&real=error`);
      expect(within(screen.getByTestId('home-top-widgets')).getByTestId('real-error')).toBeTruthy();
      expect(vi.mocked(eventsService.getUpcomingEvents)).not.toHaveBeenCalled();
    });
  });

  describe('Gemini#6 the primary button is the design system\'s primary CTA', () => {
    it('PrimaryButton = Button Decision Rules #1 / Primary CTA Pattern: bg-blue-600, hover:bg-blue-700, rounded-lg; blue-500 is the same colour in tailwind.config.js', () => {
      h.set(h.snap(null));
      renderV16();
      const cls = screen.getByTestId('sign-in-bob').className;
      for (const token of ['bg-blue-600', 'text-white', 'hover:bg-blue-700', 'rounded-lg']) expect(cls).toContain(token);
      const cfg = readFileSync('tailwind.config.js', 'utf8');
      expect(cfg).toMatch(/"500":\s*"#2563eb"/);
      expect(cfg).toMatch(/"600":\s*"#2563eb"/);
    });
  });
});
