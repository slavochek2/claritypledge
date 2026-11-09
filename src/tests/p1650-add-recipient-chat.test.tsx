/**
 * @file p1650-add-recipient-chat.test.tsx
 * @description P1650: adding a recipient to a sealed letter. The confirmation names a recipient whose letter card was not
 * posted to chat ("Not sent to chat: <name>."); CONTROL: a delivered one gets the plain confirmation. Harness as in
 * p728-add-recipient-duplicate-error.test.tsx.
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LetterReceiverModal } from '@/app/components/letters/letter-receiver-modal';

vi.mock('@/auth', () => ({ useAuth: vi.fn().mockReturnValue({ user: { id: 'user-p1650', email: 'sender@example.com' } }) }));
vi.mock('@/app/data/letters-service', () => ({ addRecipientToSealed: vi.fn() }));
vi.mock('@/app/data/agreements-service', () => ({ agreementsService: { lookupUserByEmail: vi.fn().mockResolvedValue(null) } }));
vi.mock('@/lib/letter-emails', () => ({ invokeLetterEmails: vi.fn() }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

async function sendTo(email: string, name: string) {
  render(<LetterReceiverModal mode="add-recipient" open onOpenChange={vi.fn()} letterId="letter-p1650" onRecipientAdded={vi.fn()} />);
  await act(async () => { fireEvent.change(screen.getByRole('combobox', { name: /name or email for recipient 1/i }), { target: { value: email } }); });
  await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: /full name for recipient 1/i }), { target: { value: name } }); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /send invitation/i })); });
}

describe('P1650: the add-recipient confirmation and chat', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('names a recipient who was not sent to chat', async () => {
    const { addRecipientToSealed } = await import('@/app/data/letters-service');
    const { toast } = await import('sonner');
    vi.mocked(addRecipientToSealed).mockResolvedValue({ deliveryId: 'd1', skipped: [{ delivery_id: 'd1', name: 'Alice Example' }] });
    await sendTo('alice@example.com', 'Alice Example');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Invitation sent to alice@example.com. Not sent to chat: Alice Example.'));
  });

  it('CONTROL: a delivered recipient gets the plain confirmation', async () => {
    const { addRecipientToSealed } = await import('@/app/data/letters-service');
    const { toast } = await import('sonner');
    vi.mocked(addRecipientToSealed).mockResolvedValue({ deliveryId: 'd2', skipped: [] });
    await sendTo('bob@example.com', 'Bob Example');
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Invitation sent to bob@example.com'));
  });
});
