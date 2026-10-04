/**
 * P1403 (founder 2026-10-04): one share row for events (WhatsApp, LINE, Facebook, Telegram,
 * More/Copy, QR) and a one-tap QR in the general share window.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventShareRow } from '@/app/prototypes/events/components/EventShareRow';
import { ShareDialog } from '@/app/components/shared/ShareDialog';

const URL_ = 'https://claritypledge.com/events/social-hike-x';

describe('P1403: EventShareRow', () => {
  it('renders the four channels with the event link, plus copy and QR', () => {
    render(<EventShareRow title="Social Hike" url={URL_} label="Bring a friend:" testId="row" />);
    const row = screen.getByTestId('row');
    expect(row.textContent).toContain('Bring a friend:');
    for (const n of ['line', 'whatsapp', 'telegram', 'facebook']) {
      const a = screen.getByTestId(`share-${n}`);
      expect(a.getAttribute('href')).toContain(encodeURIComponent(URL_));
    }
    expect(screen.getByTestId('share-event')).toBeInTheDocument();
  });

  it('orders the channels WhatsApp, LINE, Facebook, Telegram (founder 2026-10-04)', () => {
    render(<EventShareRow title="Social Hike" url={URL_} />);
    const names = screen.getAllByRole('link').map(a => a.getAttribute('aria-label'));
    expect(names).toEqual(['Share on WhatsApp', 'Share on LINE', 'Share on Facebook', 'Share on Telegram']);
  });

  it('opens a scannable QR of the event link', async () => {
    render(<EventShareRow title="Social Hike" url={URL_} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show QR code' }));
    const qr = await screen.findByTestId('share-qr-code');
    expect(qr.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Scan to open the event')).toBeInTheDocument();
  });
});

describe('P1403: QR in the general share window', () => {
  it('shows the QR on one tap and hides it again', () => {
    render(<ShareDialog open onOpenChange={() => {}} type="story" url={URL_} />);
    expect(screen.queryByTestId('share-dialog-qr')).toBeNull();
    fireEvent.click(screen.getByTestId('share-dialog-qr-toggle'));
    expect(screen.getByTestId('share-dialog-qr').querySelector('svg')).not.toBeNull();
    fireEvent.click(screen.getByTestId('share-dialog-qr-toggle'));
    expect(screen.queryByTestId('share-dialog-qr')).toBeNull();
  });
});
