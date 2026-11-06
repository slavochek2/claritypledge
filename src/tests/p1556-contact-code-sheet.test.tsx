/**
 * P1556: the My code sheet — Share appears only where the device has a share sheet, Copy link always, and Reset asks
 * before replacing the code.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const TOKEN = 'abcdef0123456789abcdef0123456789'; // gitleaks:allow — a made-up test token, not a credential
const FRESH = 'fedcba9876543210fedcba9876543210'; // gitleaks:allow — a made-up test token, not a credential
vi.mock('@/auth', () => ({ useAuth: () => ({ user: { name: 'Alex Novak', slug: 'alex-novak', avatarUrl: null, avatarColor: null, hasPledged: false } }) }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { stopSessionRecording: vi.fn() } }));
const reset = vi.fn(async () => FRESH);
vi.mock('@/app/data/contact-code-service', () => ({
  getMyContactCode: vi.fn(async () => TOKEN),
  resetMyContactCode: () => reset(),
  contactCodeUrl: (t: string) => `https://claritypledge.com/connect/${t}`,
}));

import { ContactCodeSheet } from '@/app/components/chat/contact-code-sheet';

const originalShare = navigator.share;
const writeText = vi.fn(async (_t: string) => {});
Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
afterEach(() => {
  Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true, writable: true });
  reset.mockClear();
  writeText.mockClear();
});

describe('ContactCodeSheet', () => {
  it('without a share sheet: Copy link only, no Share', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
    render(<ContactCodeSheet open onOpenChange={() => {}} />);
    expect(await screen.findByRole('button', { name: /Copy link/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Share/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Copy link/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`https://claritypledge.com/connect/${TOKEN}`));
    expect(await screen.findByRole('button', { name: /Copied/ })).toBeInTheDocument();
  });

  it('closing the share sheet is not a failure and copies nothing', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('cancelled', 'AbortError');
    });
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
    render(<ContactCodeSheet open onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Share/ }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(writeText).not.toHaveBeenCalled();
  });

  it('with a share sheet: Share opens it with the code link', async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
    render(<ContactCodeSheet open onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Share/ }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `https://claritypledge.com/connect/${TOKEN}` })));
  });

  it('Reset asks first, then replaces the code', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true, writable: true });
    render(<ContactCodeSheet open onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reset code' }));
    expect(reset).not.toHaveBeenCalled();
    expect(screen.getByText(/stop working/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(reset).toHaveBeenCalledTimes(1));
    // The sheet now carries the NEW code: Copy link copies it, not the revoked one.
    fireEvent.click(await screen.findByRole('button', { name: /Copy link/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`https://claritypledge.com/connect/${FRESH}`));
  });
});
