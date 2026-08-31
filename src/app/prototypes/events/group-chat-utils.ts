// P1194: Group chat link classification for event forms and display.
//
// Sibling of location-utils: same shape, same scheme guard. The label is derived
// from the provider so an attendee knows which app is about to open before they
// tap -- "Join group chat" tells them nothing about whether they need WhatsApp.

export type GroupChatProvider = 'whatsapp' | 'telegram' | 'signal' | 'discord' | 'other';

export interface GroupChatClassification {
  provider: GroupChatProvider;
  /** Button label, e.g. "Join WhatsApp group". */
  label: string;
}

const PROVIDER_HOSTS: Array<{ provider: GroupChatProvider; hosts: string[]; label: string }> = [
  { provider: 'whatsapp', hosts: ['chat.whatsapp.com', 'whatsapp.com', 'wa.me'], label: 'Join WhatsApp group' },
  { provider: 'telegram', hosts: ['t.me', 'telegram.me', 'telegram.dog'], label: 'Join Telegram group' },
  { provider: 'signal', hosts: ['signal.group', 'signal.me'], label: 'Join Signal group' },
  { provider: 'discord', hosts: ['discord.gg', 'discord.com', 'discordapp.com'], label: 'Join Discord server' },
];

export function classifyGroupChat(raw: string): GroupChatClassification {
  const value = (raw || '').trim();

  let host = '';
  try {
    host = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    host = '';
  }

  if (host) {
    for (const entry of PROVIDER_HOSTS) {
      if (entry.hosts.some(h => host === h || host.endsWith('.' + h))) {
        return { provider: entry.provider, label: entry.label };
      }
    }
  }

  return { provider: 'other', label: 'Join group chat' };
}

/**
 * Validation for the host-facing form. Returns an error string, or null when
 * the value is acceptable. An empty value is acceptable -- the field is optional.
 */
export function validateGroupChatUrl(raw: string): string | null {
  const value = (raw || '').trim();
  if (!value) return null;

  if (!/^https?:\/\//i.test(value)) {
    return 'Add the full link, starting with https://';
  }
  try {
    new URL(value);
  } catch {
    return 'That does not look like a valid link';
  }
  return null;
}
