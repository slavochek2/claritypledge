/**
 * P1536 server review: regular expressions that run on UPLOADED or FETCHED text must be linear. A hostile page or file of a few hundred KB held the edge function
 * in one synchronous regex for seconds to minutes, and no deadline can interrupt that. The sizes are the real limits (a page body up to 1 MB, stored text up to 200,000
 * characters); the bound is generous (a linear scan takes tens of milliseconds). SR_REDOS_SCALE and SR_REDOS_BOUND_MS exist only to show the red run at a size where
 * the quadratic code finishes in seconds instead of minutes.
 */
import { describe, expect, it } from 'vitest';
import { extractUrls, htmlToText } from '../../supabase/functions/_shared/canvas-material';
import { derivedNames, ownerMessageNames } from '../../supabase/functions/_shared/canvas-names';
import type { Material } from '../../supabase/functions/_shared/canvas-types';

const SCALE = Number(process.env.SR_REDOS_SCALE ?? 1);
const BOUND_MS = Number(process.env.SR_REDOS_BOUND_MS ?? 1500);
const HTML = Math.floor(1024 * 1024 * SCALE);
const TEXT = Math.floor(200_000 * SCALE);

function within(name: string, f: () => unknown): void {
  const t0 = performance.now();
  f();
  const ms = performance.now() - t0;
  expect(ms, `${name} took ${Math.round(ms)} ms`).toBeLessThan(BOUND_MS);
}

describe('htmlToText is linear on hostile pages', () => {
  const cases: Record<string, string> = {
    'an opening angle bracket with no close, repeated': '< '.repeat(HTML / 2),
    'a comment opener with no close, repeated': '<!--'.repeat(HTML / 4),
    'a script opener with no close, repeated': '<script>'.repeat(HTML / 8),
    'a style opener with no close, repeated': '<style a'.repeat(HTML / 8),
    'a template opener then many closers that are not its closer': '<template>' + '</templat>'.repeat(HTML / 10),
    'many tags with a long attribute run': '<a ' + 'x '.repeat(HTML / 2) + '>',
  };
  for (const [name, html] of Object.entries(cases)) it(name, () => within(name, () => htmlToText(html)));
  it('a link address with a run of trailing punctuation is linear too (extractUrls)', () => within('extractUrls', () => extractUrls('http://a' + '.'.repeat(TEXT) + 'a')));
});

describe('htmlToText: a normal page reads exactly as before', () => {
  const page = `<!doctype html><html><head><title>Acme &amp; Co</title><style>body { color: red; }</style><script type="text/javascript">var a = "<b>not text</b>";</script>
<noscript>enable js</noscript><template><p>hidden</p></template></head><body><!-- a comment <b>x</b> -->
<h1>We sell bookkeeping</h1><p class="x">To   <b>cafe</b> owners &nbsp;&lt;3 shops&gt; &quot;monthly&quot; it&#39;s 5 &gt; 3 and 2 &lt; 4.</p>
<SCRIPT>drop()</SCRIPT ><ul><li>one</li><li>two</li></ul><a href="https://example.com/x?a=1&b=2">link</a></body></html>`;
  it('keeps the visible text, drops script, style, noscript, template and comments, decodes the common entities', () => {
    expect(htmlToText(page)).toBe(`Acme & Co We sell bookkeeping To cafe owners <3 shops> "monthly" it's 5 > 3 and 2 < 4. one two link`);
  });
  it('an angle bracket pair is a tag whatever is inside, and one with no close stays text', () => {
    expect(htmlToText('1 < 2 and 3 > 2')).toBe('1 2');
    expect(htmlToText('1 < 2 and 3')).toBe('1 < 2 and 3');
  });
  it('an unclosed script is dropped as a tag and the text after it stays; an unclosed comment with no > anywhere stays text', () => {
    expect(htmlToText('before <script> after')).toBe('before after');
    expect(htmlToText('before <!-- after')).toBe('before <!-- after');
    expect(htmlToText('before <!-- a --> after')).toBe('before after');
    expect(htmlToText('a <style>x</STYLE > b <script>y</script> c')).toBe('a b c');
  });
});

describe('the names filter is linear on a hostile 200,000-character upload', () => {
  const owner = 'Alice Smith';
  const shapes: Record<string, string> = {
    'hyphenated capitals': 'Aa-'.repeat(TEXT / 3),
    'apostrophes': "A'a'a'a'".repeat(TEXT / 8),
    'capital pairs': 'Aa Bb '.repeat(TEXT / 6),
    'speaker labels': 'Bob Marley: hi\n'.repeat(TEXT / 15),
    'one huge word': 'A' + 'a'.repeat(TEXT),
  };
  for (const [name, text] of Object.entries(shapes)) {
    it(name, () => {
      const mat = { items: [{ kind: 'file', owner: true, source: 'f', text }, { kind: 'note', owner: true, source: 'n', text }], tokens: 0, truncated: false } as unknown as Material;
      within(`derivedNames ${name}`, () => derivedNames(mat, owner));
      within(`ownerMessageNames ${name}`, () => ownerMessageNames(text, owner));
    });
  }
  it('CONTROL: the shapes still find a name where there is one (the bound did not cost the filter its job)', () => {
    expect(ownerMessageNames('Anna Schmidt: hello', 'Alice Smith')).toEqual(expect.arrayContaining(['Anna Schmidt']));
    expect(ownerMessageNames("Anna's offer", 'Alice Smith')).toEqual(expect.arrayContaining(['anna']));
  });
});
