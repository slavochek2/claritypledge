/**
 * P1336 review (2026-10-01) — pins for behaviour the UAT rounds added: the preparation route is
 * immersive until ?done=1 (signed-in), the shared avatar stack's default is unchanged for the event
 * card, and the preparation's social proof shows at most 4 plain faces.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { isImmersiveLetterRoute } from '@/app/layouts/immersive-letter-route';
import { AttendeeAvatarStack } from '@/app/prototypes/events/components/AttendeeAvatarStack';
import { EventBox, SocialProof } from '@/app/prototypes/events/prep/PrepPieces';

describe('immersive route: the preparation', () => {
  it('is immersive while in progress, leaves on ?done=1 for a signed-in viewer only', () => {
    expect(isImmersiveLetterRoute('/events/cn-2/prepare', '', true)).toBe(true);
    expect(isImmersiveLetterRoute('/events/cn-2/prepare', '?from=room', true)).toBe(true);
    expect(isImmersiveLetterRoute('/events/cn-2/prepare', '?done=1', true)).toBe(false);
    expect(isImmersiveLetterRoute('/events/cn-2/prepare', '?from=room&done=1', true)).toBe(false);
    expect(isImmersiveLetterRoute('/events/cn-2/prepare', '?done=1', false)).toBe(true);
  });

  it('touches nothing else: the event page and room stay non-immersive, letters unchanged', () => {
    expect(isImmersiveLetterRoute('/events/cn-2', '', true)).toBe(false);
    expect(isImmersiveLetterRoute('/events/cn-2/room', '', true)).toBe(false);
    expect(isImmersiveLetterRoute('/events/cn-2/prepare/extra', '', true)).toBe(false);
    expect(isImmersiveLetterRoute('/letter/abc', '', true)).toBe(true);
    expect(isImmersiveLetterRoute('/letter/abc', '?done=1', true)).toBe(false);
    expect(isImmersiveLetterRoute('/letter/abc/results', '', true)).toBe(false);
  });
});

const person = (i: number, hasPledged = true) => ({
  profileId: `id-${i}`, name: `Person ${i}`, slug: `p-${i}`, avatarColor: '#3B82F6', hasPledged,
});

describe('AttendeeAvatarStack', () => {
  it('default (event card): 28px faces, -space-x-2, "+N" counts beyond 4', () => {
    const { container } = render(
      <MemoryRouter><AttendeeAvatarStack attendees={[1, 2, 3, 4, 5, 6].map((i) => person(i))} /></MemoryRouter>,
    );
    expect(container.firstElementChild?.className).toContain('-space-x-2');
    expect(container.querySelectorAll('.w-7.h-7').length).toBeGreaterThanOrEqual(5); // 4 faces + "+2"
    expect(screen.getByText('+2')).toBeInTheDocument();
    // Control for the ring check below: pledged people DO render the ring in the default stack.
    expect(container.querySelector('.ring-blue-500')).not.toBeNull();
  });
});

describe('SocialProof (preparation)', () => {
  it('shows at most 4 faces, no "+N", no pledge ring', () => {
    const { container } = render(
      <MemoryRouter>
        <SocialProof testId="proof" line="5 people opted in at Clarity Nights" people={[1, 2, 3, 4, 5].map((i) => person(i, true))} />
      </MemoryRouter>,
    );
    expect(container.querySelectorAll('.w-10.h-10').length).toBe(4);
    expect(screen.queryByText(/^\+\d/)).toBeNull();
    expect(container.querySelector('.ring-blue-500')).toBeNull();
  });
});

describe('EventBox share button (UAT 2026-10-01)', () => {
  const event = {
    id: 'e1', slug: 'cn-2', title: 'Clarity Night #2: Test', description: '', location: 'Zuzalu library, Chiang Mai',
    datetime: '2026-10-06T11:30:00Z', durationMinutes: 120,
  } as unknown as Parameters<typeof EventBox>[0]['event'];
  const withDevice = (coarse: boolean) => {
    Object.defineProperty(navigator, 'share', { value: () => Promise.resolve(), configurable: true });
    window.matchMedia = ((q: string) => ({ matches: coarse && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  };

  it('a phone (touch + share sheet) reads "More"', () => {
    withDevice(true);
    render(<MemoryRouter><EventBox event={event} groupChatUrl={null} title="t" testId="box" /></MemoryRouter>);
    expect(screen.getByTestId('share-event')).toHaveTextContent('More');
  });

  it('a desktop with navigator.share (macOS Chrome) still reads "Copy link"', () => {
    withDevice(false);
    render(<MemoryRouter><EventBox event={event} groupChatUrl={null} title="t" testId="box" /></MemoryRouter>);
    expect(screen.getByTestId('share-event')).toHaveTextContent('Copy link');
  });
});
