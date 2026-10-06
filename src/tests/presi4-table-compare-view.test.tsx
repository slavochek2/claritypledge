// @vitest-environment jsdom
/**
 * /presi4 slide 17 — /host?view=compare: one table's people and the speaker-vs-listener rows,
 * nothing else; and a waiting line before the round.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TableCompareView } from '@/app/prototypes/events/rounds/TableCompareView';

vi.mock('@/app/prototypes/events/rounds/use-tag-positions', () => ({
  useTagPositions: () => ({
    statements: [
      { id: 'p-same', statement: 'We agree on this' },
      { id: 'p-far', statement: 'We disagree on this' },
    ],
    byProfile: new Map([
      ['prof-a', new Map([['p-same', 'agree'], ['p-far', 'strongly_agree']])],
      ['prof-b', new Map([['p-same', 'agree'], ['p-far', 'strongly_disagree']])],
    ]),
  }),
}));

const member = (id: string, name: string, profileId: string) =>
  ({ id, displayName: name, profileId, profileHasPledged: false }) as any;
const byId = new Map([
  ['a', member('a', 'Ana Speaker', 'prof-a')],
  ['b', member('b', 'Ben Listener', 'prof-b')],
  ['c', member('c', 'Cy Observer', 'prof-c')],
  ['d', member('d', 'Dee Elsewhere', 'prof-d')],
]);
const seats = [
  { id: 'a', table: 1, role: 'first' },
  { id: 'b', table: 1, role: 'second' },
  { id: 'c', table: 1, role: 'observer' },
  { id: 'd', table: 2, role: 'first' },
] as any;

describe('TableCompareView', () => {
  it('shows only table 1 and both people\'s positions', () => {
    render(
      <MemoryRouter>
        <TableCompareView round={{ id: 'r1' } as any} seats={seats} byId={byId} tableNo={1} statementTag="ikigai1" eventTitle="Clarity Night" />
      </MemoryRouter>,
    );
    const people = screen.getByTestId('table-compare-people');
    expect(people.textContent).toContain('Ana');
    expect(people.textContent).toContain('Ben');
    expect(people.textContent).toContain('Cy');
    expect(people.textContent).not.toContain('Dee');
    expect(screen.getByText('We disagree on this')).toBeTruthy();
    expect(screen.getByText('We agree on this')).toBeTruthy();
  });

  it('waits before a round', () => {
    render(<TableCompareView round={null} seats={[]} byId={byId} tableNo={1} statementTag="ikigai1" eventTitle="x" />);
    expect(screen.getByTestId('table-compare-waiting')).toBeTruthy();
  });
});
