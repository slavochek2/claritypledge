import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PointCardWithLinks } from '@/app/components/social/point-card-with-links';
import type { PointProfileOwner } from '@/app/components/social/point-card-with-links';
import type { Point } from '@/app/components/shared/prototype-types';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const OWNER_ID = 'u-owner';
const OWNER_NAME = 'Profile Owner';

const BASE_POINT: Point = {
  id: 'point-1',
  text: 'A test claim about the topic.',
  createdAt: '2026-01-01T00:00:00Z',
  positions: {},
  linkedStoryIds: [],
  visibility: 'public',
};

const PROFILE_OWNER: PointProfileOwner = {
  id: OWNER_ID,
  name: OWNER_NAME,
  position: 'agree',
  ear: 0,
};

function renderCard(currentUserId: string | undefined) {
  return render(
    <MemoryRouter>
      <PointCardWithLinks
        point={BASE_POINT}
        profileOwner={PROFILE_OWNER}
        currentUserId={currentUserId}
      />
    </MemoryRouter>
  );
}

describe('Row above point — profile quote pattern', () => {
  it('hides quote-pattern row when viewer is own profile', () => {
    renderCard(OWNER_ID);
    // profileOwner.name appears only in the quote-pattern row's <span className="font-medium">.
    // When the isOwnProfile gate is in place, that span must be absent in own-profile view.
    expect(screen.queryAllByText(OWNER_NAME, { selector: 'span' })).toHaveLength(0);
  });

  it('shows quote-pattern row when viewer is other profile', () => {
    renderCard('u-other');
    expect(screen.queryAllByText(OWNER_NAME, { selector: 'span' }).length).toBeGreaterThan(0);
  });

  it('shows quote-pattern row for anonymous viewer on other profile', () => {
    renderCard(undefined);
    expect(screen.queryAllByText(OWNER_NAME, { selector: 'span' }).length).toBeGreaterThan(0);
  });
});
