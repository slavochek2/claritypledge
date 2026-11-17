/**
 * @file p1675-hike-copy-parity.test.ts
 * @description P1675: the hike strings shared by the app and the confirmation email are identical.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8');
const server = read('supabase/functions/_shared/hike-copy.ts');
const client = read('src/app/prototypes/events/components/hike-copy.ts');

/** name -> evaluated string value of every `export const NAME = '...' | "..."`. */
function constants(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /export const (\w+) = ('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*");/g;
  for (const m of src.matchAll(re)) out[m[1]] = m[2].slice(1, -1).replace(/\\(['"\\])/g, '$1');
  return out;
}

const NAMES = [
  'HIKE_WHATSAPP_FREE_SEATS_LINE',
  'HIKE_OFFLINE_MAPS_LINE',
  'HIKE_ROLE_LEAD',
  'HIKE_ROLE_SWEEP',
  'HIKE_ROLE_WELCOMER',
  'HIKE_ROLE_TRANSPORT_LEAD',
  'HIKE_NEED_RIDE_LINE',
  'HIKE_ROLE_HEADING_SUFFIX',
  'HIKE_ROLE_LABEL_LEAD',
  'HIKE_ROLE_LABEL_SWEEP',
  'HIKE_ROLE_LABEL_WELCOMER',
  'HIKE_ROLE_LABEL_TRANSPORT_LEAD',
  'HIKE_GROUP_CHAT_LINE',
];

describe('P1675 hike copy parity', () => {
  const s = constants(server);
  const c = constants(client);
  it.each(NAMES)('%s is identical on both sides and non-empty', (name) => {
    expect(s[name]).toBeTruthy();
    expect(c[name]).toBe(s[name]);
  });
  it('the server file exports exactly the shared names', () => {
    expect(Object.keys(s).sort()).toEqual([...NAMES].sort());
  });
});
