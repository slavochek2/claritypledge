import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const load = vi.hoisted(() => vi.fn());
vi.mock('@/app/prototypes/events/prep/use-prep-state', () => ({ loadTagPoints: load }));
vi.mock('@/app/components/seo', () => ({ SEO: () => null }));
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { JoinPart1 } from '@/app/pages/org-join-part1';
import { minutesFor } from '@/app/prototypes/events/prep/prep-plan';
import { inAppPath } from '@/lib/in-app-path';

const part1 = () => render(
  <MemoryRouter><JoinPart1 groupName="G" parts={[]} viewerId={undefined} onStart={() => {}} fallback="/groups/g" /></MemoryRouter>,
);

describe('P1549 Part 1', () => {
  it('N in the title is minutesFor over the three steps', async () => {
    load.mockResolvedValue(Array.from({ length: 8 }, (_, i) => ({ id: String(i) })));
    part1();
    const n = minutesFor(['story', 'principle', 'cmp7'], { cmp7: 8, stake: 0 }, true);
    await waitFor(() => expect(screen.getByTestId('join-minutes')).toHaveTextContent(`${n} min`));
  });
  it('an empty statements list is a failed read, never a 0 minute step', async () => {
    load.mockResolvedValue([]);
    part1();
    await waitFor(() => expect(screen.getByTestId('join-read-error')).toBeInTheDocument());
  });
});

describe('inAppPath', () => {
  it.each(['/groups/a/join', '/groups/a/join?from=x'])('keeps %s', (p) => expect(inAppPath(p)).toBe(p));
  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', '/\t/evil.example', '/\n/evil.example', '', null])(
    'refuses %j', (p) => expect(inAppPath(p)).toBeNull(),
  );
});

/** P1549 founder rule: nobody joins without learning, wherever they tap Join, now or later. A new caller of the join
 *  write fails here until someone decides how it passes through the learning. Derived from the source tree. */
describe('every way to join goes through the learning', () => {
  const files = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const callers = Object.entries(files)
    .filter(([path, text]) => !path.includes('/tests/') && !path.includes('organizations-service') && /\.joinOrganization\(/.test(text))
    .map(([path]) => path).sort();
  it('only the known join paths write a membership', () => {
    expect(callers).toEqual([
      '/src/app/pages/use-org-join-state.ts', // the terms screen, reached only by a learner
      '/src/app/prototypes/events/close/EventClosePage.tsx', // the close's terms, reached only by a learner
      '/src/auth/AuthCallbackPage.tsx', // after sign-up, from the terms screen
    ]);
  });
  it('the close sends a non-learner to the learning', () => {
    const close = files['/src/app/prototypes/events/close/EventClosePage.tsx'];
    expect(close).toMatch(/learnFirst=\{askLearned\.status === 'ok' && hasLearned/);
  });
});
