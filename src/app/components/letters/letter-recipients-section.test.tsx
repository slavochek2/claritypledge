import { describe, it, expect, vi } from 'vitest';
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
    sealedAt: '2026-10-03T10:00:00Z',
    onResultsOpened: vi.fn(),
    onAddRecipients: vi.fn(),
    onPreview: vi.fn(),
    onCopyPublicLink: vi.fn(),
    ...over,
  };
  render(<MemoryRouter><LetterRecipientsSection {...props} /></MemoryRouter>);
  return props;
}

describe('LetterRecipientsSection', () => {
  it('says "No recipients yet" and still offers the actions', () => {
    const p = setup();
    expect(screen.getByText('No recipients yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add recipients' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(p.onAddRecipients).toHaveBeenCalled();
    expect(p.onPreview).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Copy public link' })).toBeNull();
    expect(screen.getByText(/Sealed Oct 3/)).toBeInTheDocument();
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
    expect(row('Di')).toHaveTextContent('done');
  });

  it('Results is one whole-letter link per person who has started or finished', () => {
    setup({
      deliveries: [
        delivery({ id: 'a', receiver_name: 'Ann', status: 'sent' }),
        delivery({ id: 'c', receiver_name: 'Cy', status: 'in_progress', steps_completed: 2, total_steps: 5 }),
        delivery({ id: 'd', receiver_name: 'Di', status: 'completed' }),
      ],
    });
    expect(within(screen.getByText('Ann').closest('li')!).queryByRole('link', { name: /Results/ })).toBeNull();
    expect(within(screen.getByText('Cy').closest('li')!).getByRole('link', { name: /Results/ })).toHaveAttribute('href', '/letter/l1/results?delivery=c');
    expect(within(screen.getByText('Di').closest('li')!).getByRole('link', { name: /Results/ })).toHaveAttribute('href', '/letter/l1/results?delivery=d');
  });

  it('marks a person with unread explain-backs as new, and opening Results reports it', () => {
    const p = setup({
      deliveries: [delivery({ id: 'd', receiver_name: 'Di', status: 'completed' })],
      newByDelivery: { d: 2 },
    });
    const li = screen.getByText('Di').closest('li')!;
    expect(within(li).getByText('2 new')).toBeInTheDocument();
    fireEvent.click(within(li).getByRole('link', { name: /Results/ }));
    expect(p.onResultsOpened).toHaveBeenCalledWith('d');
  });

  it('links a registered recipient to their profile', () => {
    setup({ deliveries: [delivery({ receiver_slug: 'ann-e' })] });
    expect(screen.getByRole('link', { name: 'Ann' })).toHaveAttribute('href', '/p/ann-e');
  });

  it('public link: one row per respondent, latest 10 then "Show all"; Copy public link offered', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      delivery({
        id: `r${i}`, receiver_email: null, receiver_name: `Resp ${i}`, status: 'completed',
        created_at: new Date(Date.UTC(2026, 9, 1, i)).toISOString(),
      }));
    const p = setup({ isPublic: true, deliveries: many });
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    expect(screen.getByText('Resp 11')).toBeInTheDocument(); // newest first
    expect(screen.queryByText('Resp 0')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all (12)' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    fireEvent.click(screen.getByRole('button', { name: 'Copy public link' }));
    expect(p.onCopyPublicLink).toHaveBeenCalled();
  });

  it('public link with no responses yet', () => {
    setup({ isPublic: true });
    expect(screen.getByText('No responses yet')).toBeInTheDocument();
  });
});
