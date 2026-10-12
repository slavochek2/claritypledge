// Deno test: run with
//   deno test supabase/functions/_shared/banner-path.test.ts
//
// P1454: cleanup may delete only a file inside the entity's own banner folder.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ownedBannerPath } from './banner-path.ts';

const P = 'https://x.supabase.co/storage/v1/object/public/banners/';
const OWN = 'profile/11111111-1111-1111-1111-111111111111/';
const OTHER = 'profile/22222222-2222-2222-2222-222222222222/';

Deno.test('own file is returned', () => {
  assertEquals(ownedBannerPath(`${P}${OWN}abc-123.png`, P, OWN), `${OWN}abc-123.png`);
});

Deno.test('another entity\'s file is refused', () => {
  assertEquals(ownedBannerPath(`${P}${OTHER}abc.png`, P, OWN), null);
});

Deno.test('other entity type with same id is refused', () => {
  assertEquals(ownedBannerPath(`${P}event/11111111-1111-1111-1111-111111111111/a.png`, P, OWN), null);
});

Deno.test('traversal, encoding, nesting, query are refused', () => {
  for (const tail of ['../../event/x/a.png', '..', 'a/../b.png', 'sub/a.png', '%2e%2e/a.png', 'a.png?x=1', 'a.png#f', '', '.hidden', 'a b.png']) {
    assertEquals(ownedBannerPath(`${P}${OWN}${tail}`, P, OWN), null, tail);
  }
});

Deno.test('foreign host or bucket is refused', () => {
  assertEquals(ownedBannerPath(`https://evil.example/${OWN}a.png`, P, OWN), null);
  assertEquals(ownedBannerPath(`https://x.supabase.co/storage/v1/object/public/other/${OWN}a.png`, P, OWN), null);
});

Deno.test('null, empty, and folder without trailing slash are refused', () => {
  assertEquals(ownedBannerPath(null, P, OWN), null);
  assertEquals(ownedBannerPath(`${P}${OWN}a.png`, P, OWN.slice(0, -1)), null);
});

Deno.test('uuid case differences still match the own folder', () => {
  const stored = 'profile/abcdefab-1234-1234-1234-abcdefabcdef/';
  assertEquals(ownedBannerPath(`${P}${stored}a.png`, P, 'profile/ABCDEFAB-1234-1234-1234-ABCDEFABCDEF/'), `${stored}a.png`);
});
