import { MessagesSquare, Lock } from 'lucide-react';
import { classifyGroupChat, type GroupChatProvider } from '../group-chat-utils';
import { safeLinkHref } from '../location-utils';

interface GroupChatBlockProps {
  /** Null for anyone the service refused — never a value the caller must remember not to render. */
  url: string | null;
  /** Show the locked, reason-to-register state instead of nothing at all. */
  showLockedState?: boolean;
}

/**
 * Brand marks, drawn inline rather than fetched.
 *
 * A remote logo would be a third-party request on every event page, and a broken
 * one leaves a button with no icon at all. These are the official glyph shapes,
 * monochrome on the brand's own background — the arrangement platform brand
 * guidelines ask for when a third party links to a group.
 */
const BRAND_ICONS: Partial<Record<GroupChatProvider, { icon: React.ReactNode; className: string }>> = {
  whatsapp: {
    className: 'bg-[#25D366] hover:bg-[#1DA851] text-white',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.896 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.892c0 2.096.549 4.142 1.595 5.945L0 24l6.335-1.652a12.02 12.02 0 005.71 1.447h.006c6.585 0 11.946-5.335 11.949-11.893a11.82 11.82 0 00-3.481-8.413Z" />
      </svg>
    ),
  },
  telegram: {
    className: 'bg-[#229ED9] hover:bg-[#1B87BA] text-white',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  signal: {
    className: 'bg-[#3A76F0] hover:bg-[#2C63D2] text-white',
    icon: <MessagesSquare className="w-5 h-5 flex-shrink-0" aria-hidden="true" />,
  },
  discord: {
    className: 'bg-[#5865F2] hover:bg-[#4752C4] text-white',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 flex-shrink-0" aria-hidden="true">
        <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.099.246.197.373.291a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.893.077.077 0 0 0-.041.106c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
};

const NEUTRAL = {
  className: 'bg-foreground hover:bg-foreground/90 text-background',
  icon: <MessagesSquare className="w-5 h-5 flex-shrink-0" aria-hidden="true" />,
};

/**
 * P1194: the event's group chat, as a button rather than a sentence in the middle
 * of a description. Two states and no third: a registered attendee gets the link,
 * everyone else gets the reason to register — never a hidden link in the payload.
 *
 * The button carries the messaging app's own colour and mark. It is doing the job
 * a brand does: telling someone which app is about to open before they commit the
 * tap. A neutral outline button read as body text on the event page and was missed.
 *
 * Deliberately NOT full width. The RSVP button is the page's one full-width primary
 * (P955); a second bar of the same size competes with it. This one sizes to its own
 * label.
 */
export function GroupChatBlock({ url, showLockedState = false }: GroupChatBlockProps) {
  if (!url) {
    if (!showLockedState) return null;
    return (
      <div
        className="flex items-start gap-3 p-4 rounded-lg border border-dashed border-border text-muted-foreground"
        data-testid="group-chat-locked"
      >
        <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p className="text-sm">
          {/* Founder-authored, 2026-08-31. */}
          Register and you'll get an invitation to our private WhatsApp group, right here — last-minute changes,
          cancellations, and coordinating rides to the mountain. Many come by motorbike, so if you
          need a lift, just ask.
        </p>
      </div>
    );
  }

  const { label, provider } = classifyGroupChat(url);
  const href = safeLinkHref(url);
  if (!href) return null;

  const brand = BRAND_ICONS[provider] ?? NEUTRAL;

  return (
    <div data-testid="group-chat-block">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="group-chat-link"
        className={`inline-flex items-center justify-center gap-2.5 h-11 px-5 rounded-full font-semibold text-sm
          transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
          focus-visible:ring-offset-2 ${brand.className}`}
      >
        {brand.icon}
        {label}
      </a>
      <p className="text-xs text-muted-foreground mt-2 max-w-md">
        {/* Founder-authored, 2026-08-31. */}
        Last-minute changes, cancellations, and getting there. Many come by motorbike — if you need a
        lift, ask in the group.
      </p>
    </div>
  );
}
