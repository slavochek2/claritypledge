/**
 * @file p1060-unknown-member-count.test.tsx
 * @description P1060 code-review finding (HIGH): a swallowed roster/member-count load
 * failure used to default to [] / {} and render a confident "0 members". Unknown is not
 * zero. These tests exercise the FAILURE path specifically — the path the feature's own
 * e2e suite never reached — and each asserts BOTH directions: absence renders nothing,
 * and a real zero still renders "0 members". A test that only proved the null case
 * would pass against a component that had simply stopped rendering the count at all.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { OrgHeader } from '@/app/components/organizations/org-header';
import type { Organization } from '@/app/data/organizations-service.interface';

const org = {
  id: 'org-1',
  slug: 'cm',
  name: '· Chiang Mai',
  blurb: null,
  visibility: 'public',
  hasEvents: true,
} as unknown as Organization;

function renderHeader(memberCount: number | null) {
  return render(
    <BrowserRouter>
      <OrgHeader
        org={org}
        memberCount={memberCount}
        isMember={false}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
      />
    </BrowserRouter>,
  );
}

describe('P1060: unknown member count is not zero', () => {
  it('renders NO member count when the count is unknown (roster load failed)', () => {
    renderHeader(null);
    // Scoped to a COUNT ("11 members"), not the word "member" — the header also
    // carries a "Join as member" CTA, and matching that made the first version of
    // this test fail against correct code.
    expect(screen.queryByText(/\d+\s+members?/i)).toBeNull();
    // The specific lie this fix exists to prevent.
    expect(screen.queryByText(/0 members/i)).toBeNull();
  });

  it('still renders "0 members" for a genuinely empty roster', () => {
    renderHeader(0);
    expect(screen.getByText(/0 members/i)).toBeTruthy();
  });

  it('renders a real count normally', () => {
    renderHeader(11);
    expect(screen.getByText(/11 members/i)).toBeTruthy();
  });
});
