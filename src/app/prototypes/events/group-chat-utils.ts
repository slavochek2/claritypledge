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

/**
 * P1542 round 7: the hosts whose invite code lives in the URL PATH (WhatsApp, Telegram, Discord) — for those the query
 * string and fragment are tracking noise and are dropped from the "opened" key. Signal keeps its group code in the
 * fragment (https://signal.group/#…), so it, and every unknown host, keeps both. Derived from PROVIDER_HOSTS so the
 * lists cannot drift. The SERVER keeps its own copy of this list in public.group_chat_key
 * (supabase/migrations/20261027170100_p1542_group_chat_key_trim.sql) — change both together.
 */
export const PATH_CODE_HOSTS: readonly string[] = PROVIDER_HOSTS
  .filter((p) => p.provider !== 'signal')
  .flatMap((p) => p.hosts);

/**
 * The SAME normalisation as the server's key (public.group_chat_key, migration 20261027170100 — keep the two identical):
 *  1. trim spaces, tabs and line breaks (exactly ' \t\r\n', like btrim(p_url, E' \t\r\n'));
 *  2. a host whose invite code is in the path (PATH_CODE_HOSTS: WhatsApp, Telegram, Discord; host lower-cased, an
 *     optional "www." ignored): drop the query string and fragment, then trailing slashes;
 *  3. any other host (Signal keeps its group code in the fragment; unknown hosts): drop only the trailing slashes
 *     before the query/fragment, and keep them.
 * Case is never changed (invite codes are case-sensitive).
 */
export function normaliseChatLink(url: string): string {
  const u = url.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  let host = '';
  try { host = new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { /* not a URL: the "other host" rule */ }
  if (PATH_CODE_HOSTS.includes(host)) return u.replace(/[?#].*$/, '').replace(/\/+$/, '');
  const cut = u.search(/[?#]/);
  return cut === -1 ? u.replace(/\/+$/, '') : u.slice(0, cut).replace(/\/+$/, '') + u.slice(cut);
}

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
