import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LetterRecipientsSection, type LetterRecipientsSectionProps } from './letter-recipients-section';
import type { LetterDelivery } from '@/app/types';

const delivery = (over: Partial<LetterDelivery> = {}): LetterDelivery =>
  ({
    id: 'dv1', letter_id: 'l1', receiver_email: 'a@example.com', receiver_name: 'Ann', receiver_slug: null,
    status: 'sent', created_at: '2026-10-01T10:00:00Z', ...over,
  }) as LetterDelivery;

function setup(over: Partial<LetterRecipientsSectionProps> = {}) {
  const props: LetterRecipientsSectionProps = {
    letterId: 'l1',
    isPublic: false,
    deliveries: [],
    newByDelivery: {},
    ...over,
  };
  render(<MemoryRouter><LetterRecipientsSection {...props} /></MemoryRouter>);
  return props;
}

describe('LetterRecipientsSection', () => {
  it('says "No recipients yet" and draws no actions: Add recipients, Preview and Copy link belong to the page header', () => {
    setup();
    expect(screen.getByText('No recipients yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/Sealed/)).toBeNull();
  });

  it('shows each person with status words and steps', () => {
    setup({
      deliveries: [
        delivery({ id: 'a', receiver_name: 'Ann', status: 'sent' }),
        delivery({ id: 'b', receiver_name: 'Bob', status: 'opened', steps_completed: 0, total_steps: 5 }),
        delivery({ id: 'c', receiver_name: 'Cy', status: 'in_progress', steps_completed: 2, total_steps: 5 }),
        delivery({ id: 'd', receiver_name: 'Di', status: 'completed', steps_completed: 5, total_steps: 5 }),
      ],
    });
    const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
    expect(row('Ann')).toHaveTextContent('Invited');
    expect(row('Ann')).not.toHaveTextContent('steps');
    expect(row('Bob')).toHaveTextContent('Opened');
    expect(row('Cy')).toHaveTextContent('In progress');
    expect(row('Cy')).toHaveTextContent('2 of 5 steps');
    expect(row('Di')).toHaveTextContent('Done');
  });

  it('"N of M steps" shows only while in progress: Done says Done alone, Opened and Invited carry no steps', () => {
    setup({
      deliveries: [
        delivery({ id: 'b', receiver_name: 'Bob', status: 'opened', steps_completed: 0, total_steps: 5 }),
        delivery({ id: 'c', receiver_name: 'Cy', status: 'in_progress', steps_completed: 3, total_steps: 8 }),
        delivery({ id: 'd', receiver_name: 'Di', status: 'completed', steps_completed: 3, total_steps: 8 }),
      ],
    });
    const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;
    expect(row('Cy')).toHaveTextContent('In progress · 3 of 8 steps');
    expect(row('Di')).toHaveTextContent('Done');
    expect(row('Di')).not.toHaveTextContent(/steps/);
    expect(row('Di')).not.toHaveTextContent('·');
    expect(row('Bob')).not.toHaveTextContent(/steps/);
  });

  it('the whole row of a person who started or finished opens their results; there is no separate Results link', () => {
    setup({
      deliveries: [
        delivery({ id: 'a', receiver_name: 'Ann', status: 'sent' }),
        delivery({ id: 'c', receiver_name: 'Cy', status: 'in_progress', steps_completed: 2, total_steps: 5 }),
        delivery({ id: 'd', receiver_name: 'Di', status: 'completed' }),
      ],
    });
    expect(screen.queryByRole('link', { name: /Results/ })).toBeNull();
    expect(screen.queryByText('Results')).toBeNull();
    const cy = within(screen.getByText('Cy').closest('li')!).getByRole('link');
    const di = within(screen.getByText('Di').closest('li')!).getByRole('link');
    expect(cy).toHaveAttribute('href', '/letter/l1/results?delivery=c');
    expect(di).toHaveAttribute('href', '/letter/l1/results?delivery=d');
    // the link stretches over the row, so a tap anywhere on it opens the results
    expect(cy.className).toContain("after:absolute");
    expect(cy.className).toContain("after:inset-0");
    expect(screen.getByText('Cy').closest('li')!.className).toContain('relative');
    // a person who has not started has nothing to open
    expect(within(screen.getByText('Ann').closest('li')!).queryByRole('link')).toBeNull();
  });

  it('a new mark is a dot with an accessible name, not blue text; opening the results does not clear it (the results page does)', () => {
    setup({
      deliveries: [delivery({ id: 'd', receiver_name: 'Di', status: 'completed' })],
      newByDelivery: { d: 2 },
    });
    const li = screen.getByText('Di').closest('li')!;
    const dot = within(li).getByRole('img', { name: 'New' });
    expect(dot.className).toContain('rounded-full');
    expect(dot.textContent).toBe('');
    expect(li.textContent).not.toMatch(/new/i);
    expect(dot.className).toContain('bg-blue-600');
    expect(li.querySelector('.text-blue-600, .text-blue-500')).toBeNull(); // no blue text
    fireEvent.click(within(li).getByRole('link'));
    expect(within(li).getByRole('img', { name: 'New' })).toBeInTheDocument();
  });

  it('a person with nothing new has no dot', () => {
    setup({ deliveries: [delivery({ id: 'd', receiver_name: 'Di', status: 'completed' })], newByDelivery: { d: 0 } });
    expect(screen.queryByRole('img', { name: 'New' })).toBeNull();
  });

  it('every row is at least 40px tall so a tap lands', () => {
    setup({ deliveries: [delivery({ status: 'completed' })] });
    expect(screen.getByRole('listitem').className).toContain('min-h-12');
  });

  it('a recipient without results links to their profile when registered', () => {
    setup({ deliveries: [delivery({ receiver_slug: 'ann-e' })] });
    expect(screen.getByRole('link', { name: 'Ann' })).toHaveAttribute('href', '/p/ann-e');
  });

  it('public link: one row per respondent, latest 10 then "Show all"', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      delivery({
        id: `r${i}`, receiver_email: null, receiver_name: `Resp ${i}`, status: 'completed',
        created_at: new Date(Date.UTC(2026, 9, 1, i)).toISOString(),
      }));
    setup({ isPublic: true, deliveries: many });
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('Resp 11')).toBeInTheDocument(); // newest first
    expect(screen.queryByText('Resp 0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all (12)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Show all (12)' })).toBeInTheDocument();
  });

  describe('public-link respondents say when they finished', () => {
    afterEach(() => vi.useRealTimers());
    const respondent = (over: Partial<LetterDelivery>) =>
      delivery({ receiver_email: null, receiver_name: null, status: 'completed', ...over });

    it('Done · 2d ago, so identical "Anonymous" rows can be told apart', () => {
      vi.useFakeTimers({ now: new Date('2026-10-25T12:00:00Z') });
      setup({
        isPublic: true,
        deliveries: [
          respondent({ id: 'r1', completed_at: '2026-10-23T12:00:00Z', created_at: '2026-10-23T11:00:00Z' }),
          respondent({ id: 'r2', completed_at: '2026-10-25T09:00:00Z', created_at: '2026-10-25T08:00:00Z' }),
        ],
      });
      const rows = screen.getAllByRole('listitem');
      expect(rows.map(r => r.textContent)).toEqual(['AnonymousDone · 3h ago', 'AnonymousDone · 2d ago']); // newest first
    });

    it('CONTROLS: an unfinished respondent and a finished one with no time say nothing extra; a named recipient who finished stays "Done" alone', () => {
      vi.useFakeTimers({ now: new Date('2026-10-25T12:00:00Z') });
      setup({
        isPublic: true,
        deliveries: [
          respondent({ id: 'r1', status: 'in_progress', completed_at: null, steps_completed: 1, total_steps: 4 }),
          respondent({ id: 'r2', completed_at: null }),
          delivery({ id: 'n1', receiver_name: 'Di', status: 'completed', completed_at: '2026-10-23T12:00:00Z' }),
        ],
      });
      const text = (r: HTMLElement) => r.textContent;
      const items = screen.getAllByRole('listitem');
      expect(items.map(text).sort()).toEqual(['AnonymousDone', 'AnonymousIn progress · 1 of 4 steps', 'DiDone'].sort());
    });
  });

  it('named recipients are newest first, like respondents; an unparseable date sorts last without breaking', () => {
    setup({
      deliveries: [
        delivery({ id: 'a', receiver_name: 'Old', created_at: '2026-10-01T10:00:00Z' }),
        delivery({ id: 'b', receiver_name: 'Bad', created_at: 'not a date' }),
        delivery({ id: 'c', receiver_name: 'New', created_at: '2026-10-02T10:00:00Z' }),
      ],
    });
    const names = screen.getAllByRole('listitem').map(li => li.textContent?.slice(0, 3));
    expect(names).toEqual(['New', 'Old', 'Bad']);
  });

  it('public link with no responses yet', () => {
    setup({ isPublic: true });
    expect(screen.getByText('No responses yet')).toBeInTheDocument();
  });
});
