/**
 * @file p1366-org-card-open.test.tsx
 * @description FOUNDER DECISION 2026-09-29 — the /groups card's `Open →` reads as the same
 * outlined secondary button as the list cards' `Details →`, from one shared class constant.
 *
 * It MUST stay a decorative `<span aria-hidden="true">`: the card is a stretched link (P1204), so
 * a real button or link here would be a second, nested interactive target — invalid, and a second
 * tab stop for the same destination. Hovering the card lights it like a hovered button.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrgDirectoryPage } from '@/app/pages/org-directory-page';
import { DETAILS_BUTTON_CLASS } from '@/app/components/shared/card-action-classes';

vi.mock('@/app/data/organizations-service', () => ({
  organizationsService: {
    listPublicOrganizations: vi.fn(async () => [
      { id: 'org-1', slug: 'test-group', name: 'Test Group', blurb: null },
    ]),
    getMemberCounts: vi.fn(async () => ({ 'org-1': 3 })),
    getParticipation: vi.fn(async () => ({})),
    getMyMembershipOrgIds: vi.fn(async () => []),
    getEventSummaries: vi.fn(async () => ({})),
  },
}));

describe('P1366 — /groups card "Open →"', () => {
  it('is a decorative aria-hidden span styled exactly like the Details → button, lit on card hover', async () => {
    render(<MemoryRouter><OrgDirectoryPage /></MemoryRouter>);
    const card = await screen.findByTestId('org-card');
    const open = within(card).getByText('Open');
    expect(open.tagName).toBe('SPAN');
    expect(open.getAttribute('aria-hidden')).toBe('true');
    // same classes as Details → (one shared constant), plus the card-hover state
    const tokens = open.className.split(/\s+/);
    for (const cls of DETAILS_BUTTON_CLASS.split(/\s+/)) expect(tokens).toContain(cls);
    expect(tokens).toContain('group-hover:bg-muted');
    // the divider line stays
    expect(open.parentElement!.className).toContain('border-t');
  });

  it('adds no interactive element: the card still has exactly one link and no button', async () => {
    render(<MemoryRouter><OrgDirectoryPage /></MemoryRouter>);
    const card = await screen.findByTestId('org-card');
    expect(within(card).getAllByRole('link')).toHaveLength(1);
    expect(within(card).queryAllByRole('button')).toHaveLength(0);
    const open = within(card).getByText('Open');
    expect(open.querySelector('a, button, [tabindex]')).toBeNull();
    expect(open.closest('a, button')).toBeNull();
  });
});
