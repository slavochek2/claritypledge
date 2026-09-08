/**
 * P1271: frontmatter parsing must be pinned to YAML.
 *
 * gray-matter's `javascript` engine parses via eval(), and the engine is chosen
 * by a language tag on the opening delimiter line. These tests prove the tag
 * cannot reach a code-executing engine through parseFrontmatter().
 */
import { describe, it, expect } from 'vitest';
import matter from 'gray-matter';
import { parseFrontmatter, stringifyFrontmatter, FrontmatterEngineError } from '../../lib/frontmatter';

const jsPayload = [
  '---js',
  'module.exports = { pwned: (globalThis.__p1271_pwned = true) };',
  '---',
  '# body',
  '',
].join('\n');

const plainSpec = [
  '---',
  'status: week',
  'type: bug',
  'rank: 1000079',
  'tags: [tooling, security]',
  '---',
  '# P1271',
  '',
].join('\n');

describe('P1271 frontmatter engine pinning', () => {
  it('demonstrates the unpinned vulnerability (bare matter() executes the block)', () => {
    delete (globalThis as Record<string, unknown>).__p1271_pwned;
    matter(jsPayload);
    expect((globalThis as Record<string, unknown>).__p1271_pwned).toBe(true);
  });

  it('does NOT execute the block via parseFrontmatter — it throws instead', () => {
    delete (globalThis as Record<string, unknown>).__p1271_pwned;
    expect(() => parseFrontmatter(jsPayload)).toThrow(FrontmatterEngineError);
    expect((globalThis as Record<string, unknown>).__p1271_pwned).toBeUndefined();
  });

  it('rejects every alias that gray-matter maps onto a code-executing engine', () => {
    for (const tag of ['js', 'javascript', 'JavaScript', 'coffee', 'cson', 'coffeescript']) {
      const doc = `---${tag}\nfoo = 1\n---\nbody\n`;
      expect(() => parseFrontmatter(doc), `tag: ${tag}`).toThrow();
    }
  });

  it('rejects an unknown language tag rather than falling back to YAML', () => {
    expect(() => parseFrontmatter('---toml\na = 1\n---\nbody\n')).toThrow();
    expect(() => parseFrontmatter('---wat\na: 1\n---\nbody\n')).toThrow();
  });

  it('confirms { language: "yaml" } alone is NOT a fix (inline tag still wins)', () => {
    delete (globalThis as Record<string, unknown>).__p1271_pwned;
    matter(jsPayload, { language: 'yaml' });
    expect((globalThis as Record<string, unknown>).__p1271_pwned).toBe(true);
  });

  // Adversarial review, 2026-09-08: overriding the engine table alone was NOT
  // enough. gray-matter resolves the engine with `options.engines[name]` on a
  // plain object, so these tags hit Object.prototype, return a function, and
  // PARSE CLEANLY instead of throwing.
  it('rejects a language tag that names an inherited Object.prototype key', () => {
    for (const tag of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      const doc = `---${tag}\nfoo: 1\n---\nbody\n`;
      expect(() => parseFrontmatter(doc), `tag: ${tag}`).toThrow(FrontmatterEngineError);
    }
  });

  it('rejects a tag regardless of casing or surrounding whitespace', () => {
    for (const tag of ['JS', 'Js', 'JavaScript', ' js', 'js ', '\tjs']) {
      expect(() => parseFrontmatter(`---${tag}\nfoo: 1\n---\nbody\n`), `tag: ${tag}`).toThrow(
        FrontmatterEngineError
      );
    }
  });

  // Adversarial review, 2026-09-08: the tag check and gray-matter disagreed about
  // where the document starts. gray-matter strips a BOM in toFile() before its own
  // delimiter test, so a BOM-prefixed tagged file bypassed the check entirely and
  // parsed into attacker-shaped junk. Reported by a reviewer, reproduced here first.
  it('rejects a tag hidden behind a leading UTF-8 BOM', () => {
    const BOM = '\uFEFF';
    const tags = ['js', 'constructor', 'valueOf', 'toString', 'hasOwnProperty', 'isPrototypeOf'];
    for (const tag of tags) {
      expect(() => parseFrontmatter(`${BOM}---${tag}\na: 1\n---\nbody\n`), `BOM+${tag}`).toThrow(
        FrontmatterEngineError
      );
    }
  });

  it('still parses BOM-prefixed untagged frontmatter normally', () => {
    const { data } = parseFrontmatter('\uFEFF---\na: 1\n---\nbody\n');
    expect(data).toEqual({ a: 1 });
  });

  it('leaves a leading ---- horizontal rule alone (gray-matter treats it as body)', () => {
    const doc = '----\nnot frontmatter\n';
    expect(() => parseFrontmatter(doc)).not.toThrow();
    expect(parseFrontmatter(doc).data).toEqual({});
  });

  it('does not let a __proto__ YAML key pollute Object.prototype', () => {
    const { data } = parseFrontmatter('---\n__proto__:\n  polluted: yes\n---\nbody\n');
    expect(data).toBeDefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('parses ordinary untagged spec frontmatter unchanged', () => {
    const { data, content } = parseFrontmatter(plainSpec);
    expect(data).toEqual({ status: 'week', type: 'bug', rank: 1000079, tags: ['tooling', 'security'] });
    expect(content.trim()).toBe('# P1271');
  });

  it('round-trips through stringifyFrontmatter', () => {
    const { data, content } = parseFrontmatter(plainSpec);
    const out = stringifyFrontmatter(content, data);
    expect(parseFrontmatter(out).data).toEqual(data);
  });
});
