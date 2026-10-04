/**
 * @file EventShareRow.tsx
 * @description One share row for every event surface (P1387 layout, made shared by P1403):
 * a label, LINE / WhatsApp / Telegram / Facebook, and a last button that opens the phone's share
 * sheet ("More") or copies the link on desktop ("Copy link"). Used by the prep confirmation, the
 * standard "You're Registered!" screen and the "You're going!" card on the event page, so the
 * channels look the same wherever someone shares an event.
 */
import { useState } from 'react';
import { Link2, MoreHorizontal, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { copyToClipboard, shareOrCopy } from '@/lib/utils';
import { shareTargets } from '../prep/prep-content';

export function EventShareRow({
  title,
  url,
  label = 'Share',
  testId,
  className = '',
}: {
  title: string;
  url: string;
  label?: string;
  testId?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  // On a phone the last button opens the share sheet — every other app is there — so it reads
  // "More" (UAT 2026-10-01). Desktop Chrome on macOS also has navigator.share, but there people
  // expect "Copy link" (founder, same day): touch + share sheet, not the API alone.
  const canShareSheet =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function' &&
    typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const copyLink = async () => {
    const result = canShareSheet
      ? await shareOrCopy(title, url)
      : (await copyToClipboard(url)) ? 'copied' : 'failed';
    if (result === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else if (result === 'failed') {
      toast.error('Could not copy link');
    }
  };
  const iconButton =
    'inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-foreground hover:bg-muted';

  return (
    // P1387 (founder, 2026-10-02): the label on the same line as the icons.
    <div className={`flex flex-wrap items-center justify-center gap-1 sm:gap-2 ${className}`} data-testid={testId}>
      <p className="w-full text-center text-sm font-medium text-muted-foreground sm:w-auto">{label}</p>
      <div className="contents">
        {shareTargets(url, title).map(({ name, glyph, href }) => (
          <a
            key={name}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Share on ${name}`}
            title={name}
            className={iconButton}
            data-testid={`share-${name.toLowerCase()}`}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d={glyph} />
            </svg>
          </a>
        ))}
        <button
          type="button"
          onClick={copyLink}
          aria-label={copied ? 'Copied' : canShareSheet ? 'More apps' : 'Copy link'}
          className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border border-border bg-white px-2.5 text-sm font-medium text-foreground hover:bg-muted"
          data-testid="share-event"
        >
          {canShareSheet ? <MoreHorizontal className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
          {/* Phones: icon only so the six buttons fit one row at 320px; the label returns on wider screens. */}
          <span className={canShareSheet ? 'hidden sm:inline' : ''}>{copied ? 'Copied!' : canShareSheet ? 'More' : 'Copy link'}</span>
        </button>
        {/* Founder 2026-10-04: in person ("how do I join?") the other phone just scans. */}
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          aria-label="Show QR code"
          title="QR code"
          className={iconButton}
          data-testid="share-qr"
        >
          <QrCode className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-xs mx-auto">
          <DialogHeader className="px-6">
            <DialogTitle className="text-center">Scan to open the event</DialogTitle>
            <DialogDescription className="text-center">{title}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center rounded-lg bg-white p-4" data-testid="share-qr-code">
            <QRCodeSVG value={url} size={232} marginSize={1} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
