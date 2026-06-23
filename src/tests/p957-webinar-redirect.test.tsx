/**
 * @file p957-webinar-redirect.test.tsx
 * @description P957 — the legacy `/events/webinar` route is a permanent redirect to the
 * canonical `/events/experiment`. Proves the hop fires and that the query string survives
 * it (in-the-wild links may carry `?utm=…`). Guards against a bare <Navigate> that would
 * silently drop the search params EventsRoot preserves.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { WebinarRedirect } from '@/app/prototypes/events';

/** Probe that renders wherever the redirect lands, exposing the full path + search. */
function LandingProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="landed">{pathname + search}</div>;
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/events/webinar" element={<WebinarRedirect />} />
        <Route path="/events/experiment" element={<LandingProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('P957: /events/webinar → /events/experiment redirect', () => {
  it('redirects the legacy path to the canonical experiment route', () => {
    renderAt('/events/webinar');
    expect(screen.getByTestId('landed')).toHaveTextContent('/events/experiment');
  });

  it('preserves the query string across the redirect (UTM / series params survive)', () => {
    renderAt('/events/webinar?utm=campaign-x&series=lost-cofounders');
    expect(screen.getByTestId('landed')).toHaveTextContent(
      '/events/experiment?utm=campaign-x&series=lost-cofounders',
    );
  });
});
