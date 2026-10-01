/**
 * @file p1383-org-host-event-header.test.tsx
 * @description P1383 — an organizer's Host event lives in the group HEADER (visible on
 * every tab), carries ?org=, and is the one primary; nobody else sees it.
 * Both directions asserted: a header that rendered Host event for everyone would pass
 * an organizer-only test.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { OrgHeader } from '@/app/components/organizations/org-header';
import type { Organization, OrgRole } from '@/app/data/organizations-service.interface';

const org = { id: 'org-1', slug: 'cm', name: 'Chiang Mai', blurb: null, visibility: 'public', hasEvents: true } as unknown as Organization;

function renderHeader(myRole: OrgRole | null) {
  return render(
    <BrowserRouter>
      <OrgHeader org={org} memberCount={3} isMember={myRole !== null} myRole={myRole}
        organizerCount={2} onJoin={vi.fn()} onLeave={vi.fn()} />
    </BrowserRouter>,
  );
}

describe('P1383 — Host event in the group header', () => {
  it('organizer sees Host event linking to /events/new?org=<slug>', () => {
    renderHeader('organizer');
    const link = screen.getByRole('link', { name: /host event/i });
    expect(link.getAttribute('href')).toBe('/events/new?org=cm');
  });

  it('organizer: Invite drops to outline so Host event is the single primary (P955)', () => {
    renderHeader('organizer');
    expect(screen.getByRole('button', { name: /invite/i }).className).not.toContain('bg-blue-500');
    expect(screen.getByRole('link', { name: /host event/i }).className).toContain('bg-blue-500');
  });

  it('plain member sees no Host event and keeps a primary Invite', () => {
    renderHeader('member');
    expect(screen.queryByRole('link', { name: /host event/i })).toBeNull();
    expect(screen.getByRole('button', { name: /invite/i }).className).toContain('bg-blue-500');
  });

  it('visitor sees no Host event', () => {
    renderHeader(null);
    expect(screen.queryByRole('link', { name: /host event/i })).toBeNull();
  });
});
