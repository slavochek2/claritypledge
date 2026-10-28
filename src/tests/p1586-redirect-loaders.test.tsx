// @vitest-environment jsdom
/**
 * P1586: a bare <Navigate> renders nothing for a frame, so a redirect between two page loaders left a
 * blank gap (measured on the signed-out /events cold load by e2e/p1586-loading-continuity.spec.ts).
 * Each redirect renders the page loader beside its Navigate, so the mark stays until the target draws.
 *
 * Server rendering runs no effects, so <Navigate> never fires: the markup is exactly the frame the
 * browser paints before the hop.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/app/prototypes/events/components/EventsList', () => ({ EventsList: () => null }));
vi.mock('@/app/prototypes/events/components/EventDetail', () => ({ EventDetail: () => null }));
vi.mock('@/app/prototypes/events/components/CreateEvent', () => ({ CreateEvent: () => null }));
vi.mock('@/app/prototypes/events/components/EditEvent', () => ({ EditEvent: () => null }));
vi.mock('@/app/prototypes/events/components/RsvpConfirm', () => ({ RsvpConfirm: () => null }));
vi.mock('@/app/prototypes/events/components/NextWebinarRedirect', () => ({ NextWebinarRedirect: () => null }));

import { EventsPrototype, WebinarRedirect } from '@/app/prototypes/events';

const MARK = 'aria-label="Loading"';

function frameAt(path: string, routePath: string, element: JSX.Element): string {
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => {}); // Navigate warns when rendered on the server
  try {
    return renderToString(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    );
  } finally {
    spy.mockRestore();
  }
}

describe('P1586 redirect frames carry the page loader', () => {
  it('/events (EventsRoot) paints the mark before redirecting to the group page', () => {
    expect(frameAt('/events', '/events/*', <EventsPrototype />)).toContain(MARK);
  });

  it('/events/webinar paints the mark before redirecting to /events/experiment', () => {
    expect(frameAt('/events/webinar', '/events/webinar', <WebinarRedirect />)).toContain(MARK);
  });
});
