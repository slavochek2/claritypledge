/**
 * P1271: YAML-pinned frontmatter parsing.
 *
 * `gray-matter` picks its parse engine from a language tag written on the same
 * line as the opening `---` delimiter (`---js`, `---javascript`). Its bundled
 * `javascript` engine parses by calling `eval()`, so a crafted spec file can run
 * code in any process that parses it. Feature specs arrive via PRs to a public
 * repo, so "the input is repo-controlled" is not a defense.
 *
 * The `{ language: 'yaml' }` option does NOT fix this: gray-matter sets
 * `file.language` from the option first, then overwrites it with the inline tag
 * when one is present (gray-matter/index.js `parseMatter`). Pinning has to
 * happen at the engine table instead.
 *
 * So the tag is rejected before gray-matter ever sees it. Overriding the engine
 * table is NOT sufficient on its own: gray-matter looks the engine up with
 * `options.engines[name]` on a plain object (lib/engine.js), so a tag naming an
 * inherited key — `constructor`, `toString`, `valueOf`, `hasOwnProperty` —
 * resolves to a function off `Object.prototype` and parsing SUCCEEDS, yielding
 * attacker-shaped junk instead of throwing. A null-prototype table does not help
 * either, because lib/defaults.js re-merges it through `Object.assign({}, ...)`.
 * Measured, not reasoned: `---constructor` parsed cleanly against the
 * engine-override-only version of this file.
 *
 * The repo has no legitimate use for a frontmatter language tag, so any tag at
 * all is refused up front. The engine overrides stay as a second layer.
 *
 * The tag check must normalize its input EXACTLY as gray-matter does, or the two
 * layers disagree about where the document starts and the gap is the bypass. A
 * leading UTF-8 BOM is the case that bit us: gray-matter strips it in `toFile()`
 * before its own delimiter test, so a BOM-prefixed file it happily parses as
 * tagged frontmatter looked like "not frontmatter at all" to an un-normalized
 * `startsWith` here. Adversarial review, 2026-09-08 — reported, then reproduced
 * locally before the fix.
 */

import matter from 'gray-matter';

export class FrontmatterEngineError extends Error {
  constructor(language: string) {
    super(
      `Refusing to parse frontmatter with the "${language}" engine — only YAML is allowed. ` +
        `Remove the language tag after the opening --- delimiter.`
    );
    this.name = 'FrontmatterEngineError';
  }
}

const refuse = (language: string) => ({
  parse: (): never => {
    throw new FrontmatterEngineError(language);
  },
  stringify: (): never => {
    throw new FrontmatterEngineError(language);
  },
});

// Keys mirror gray-matter's own engine table plus its alias targets, so no
// dangerous engine survives the merge in gray-matter/lib/defaults.js.
const YAML_ONLY_ENGINES = {
  javascript: refuse('javascript'),
  js: refuse('js'),
  json: refuse('json'),
  coffee: refuse('coffee'),
  cson: refuse('cson'),
  toml: refuse('toml'),
};

const OPTIONS = { language: 'yaml', engines: YAML_ONLY_ENGINES } as const;

const DELIM = '---';

/**
 * Refuse a language tag on the opening delimiter line.
 *
 * Mirrors gray-matter's own two preconditions (index.js `parseMatter`) so this
 * never fires on input gray-matter would not treat as frontmatter: the content
 * must start with the delimiter, and a fourth `-` means "not frontmatter" (so a
 * file opening with an `----` horizontal rule is left alone).
 */
function assertNoLanguageTag(rawInput: string): void {
  // Match gray-matter's own normalization (lib/to-file.js -> lib/utils.js, which
  // uses strip-bom-string) so both layers see the same document.
  const input = rawInput.charCodeAt(0) === 0xfeff ? rawInput.slice(1) : rawInput;

  if (!input.startsWith(DELIM)) return;
  if (input.charAt(DELIM.length) === '-') return;

  const eol = input.indexOf('\n', DELIM.length);
  const tag = (eol === -1 ? input.slice(DELIM.length) : input.slice(DELIM.length, eol)).trim();
  if (tag !== '') throw new FrontmatterEngineError(tag);
}

/** Parse frontmatter, pinned to the YAML engine. Use instead of `matter()`. */
export function parseFrontmatter(input: string) {
  assertNoLanguageTag(input);
  return matter(input, OPTIONS);
}

/** Serialize frontmatter as YAML. Use instead of `matter.stringify()`. */
export function stringifyFrontmatter(body: string, data: object): string {
  return matter.stringify(body, data, OPTIONS);
}
