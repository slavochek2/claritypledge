// @vitest-environment jsdom
/**
 * P1562 §3.1: a page with nothing to show yet renders ClarityPageLoader and nothing else — never a bare ClarityLoader
 * in a min-h-screen box (it sat at the top of the content area: the founder's "jumping" icon) and never "Loading..."
 * text. Outside the shell ClarityPageLoader is the boot splash (`boot-loader`); its mark is viewport-centred.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/auth', () => ({ useAuth: () => auth.value }));
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const never = () => new Promise<never>(() => {});
vi.mock('@/app/data/organizations-service', () => ({
  organizationsService: {
    getOrganizationBySlug: vi.fn(() => never()),
    getMyMembership: vi.fn(() => never()),
    getMembers: vi.fn(() => never()),
    getParticipation: vi.fn(() => never()),
  },
}));
vi.mock('@/app/data/offline-reads', () => ({ groupsRead: () => ({ type: 'groups', id: 'all', fetch: vi.fn() }) }));
vi.mock('@/lib/offline-read-cache', () => ({ readThrough: vi.fn(() => never()) }));
vi.mock('@/app/hooks/use-offline-read-state', () => {
  const state = { apply: (r: unknown) => r, live: () => {}, reconnectKey: 0, offlineMiss: false };
  return { useOfflineReadState: () => state };
});
vi.mock('@/app/data/events-service', () => ({ eventsService: { createEvent: vi.fn() } }));

import { OrgPage } from '@/app/pages/org-page';
import { OrgJoinPage } from '@/app/pages/org-join-page';
import { OrgDirectoryPage } from '@/app/pages/org-directory-page';
import { CreateEvent } from '@/app/prototypes/events/components/CreateEvent';

function at(path: string, route: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={route} element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The one page loader, and none of the old shapes. */
function expectPageLoaderOnly() {
  expect(screen.getByTestId('boot-loader')).toBeInTheDocument();
  expect(screen.queryByTestId('loader')).toBeNull();
  expect(screen.queryByText(/Loading/)).toBeNull();
  expect(screen.getAllByRole('img', { name: 'Loading' })).toHaveLength(1);
}

beforeEach(() => {
  auth.value = { user: null, session: null, isLoading: false, sessionChecked: true };
});

describe('P1562 §3.1: page-level waits render ClarityPageLoader', () => {
  it('/groups/:slug while the group loads', () => {
    at('/groups/cm', '/groups/:slug', <OrgPage />);
    expectPageLoaderOnly();
  });

  it('/groups/:slug/join while the group loads', () => {
    at('/groups/cm/join', '/groups/:slug/join', <OrgJoinPage />);
    expectPageLoaderOnly();
  });

  it('/groups while the directory loads', () => {
    at('/groups', '/groups', <OrgDirectoryPage />);
    expectPageLoaderOnly();
  });

  it('/events/new while the session is restored (no "Loading..." text)', () => {
    auth.value = { user: null, session: null, isLoading: true, sessionChecked: false };
    at('/events/new', '/events/new', <CreateEvent />);
    expectPageLoaderOnly();
  });
});
