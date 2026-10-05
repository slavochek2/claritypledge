/**
 * P1416 review round, item 1: the "has the app changed?" signal must ignore deploys that change
 * nothing users run. Every deploy rehashes the entry module (the Sentry release id is baked into it),
 * and most deploys are docs/skills/tests only — comparing entry scripts would prompt on nearly every
 * one. The build stamps a fingerprint of the app's own inputs into index.html instead.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  computeAppBuildFingerprint,
  appBuildFingerprintPlugin,
  APP_BUILD_META_NAME as PLUGIN_META_NAME,
} from '@/pwa/app-build-fingerprint';
import { APP_BUILD_META_NAME as CLIENT_META_NAME } from '@/lib/app-update-check';

let root: string;

function put(rel: string, content: string) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'p1416-fp-'));
  put('src/main.tsx', 'export const a = 1;');
  put('src/app/page.tsx', 'export const Page = () => null;');
  put('src/app/page.test.tsx', 'test("x", () => {});');
  put('src/tests/thing.test.ts', 'test("y", () => {});');
  put('public/robots.txt', 'User-agent: *');
  put('index.html', '<html></html>');
  put('package-lock.json', '{}');
  put('vite.config.ts', 'export default {}');
  put('tailwind.config.js', 'module.exports = {}');
  put('postcss.config.js', 'module.exports = {}');
  put('docs/decisions.md', '# decisions');
  put('features/p1_spec.md', '# spec');
  put('.claude/commands/skill.md', '# skill');
  put('scripts/tool.sh', 'echo hi');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('computeAppBuildFingerprint', () => {
  it('is stable for unchanged inputs', () => {
    expect(computeAppBuildFingerprint(root)).toBe(computeAppBuildFingerprint(root));
    expect(computeAppBuildFingerprint(root)).toMatch(/^[0-9a-f]{16}$/);
  });

  it.each([
    ['docs/decisions.md'],
    ['features/p1_spec.md'],
    ['.claude/commands/skill.md'],
    ['scripts/tool.sh'],
    ['src/tests/thing.test.ts'],
    ['src/app/page.test.tsx'],
  ])('ignores a change to %s (nothing users run)', (rel) => {
    const before = computeAppBuildFingerprint(root);
    put(rel, 'changed');
    expect(computeAppBuildFingerprint(root)).toBe(before);
  });

  it.each([
    ['src/app/page.tsx'],
    ['src/app/new-file.ts'],
    ['public/robots.txt'],
    ['index.html'],
    ['package-lock.json'],
    ['vite.config.ts'],
    ['tailwind.config.js'],
    ['postcss.config.js'],
  ])('changes when %s changes (it changes what users run)', (rel) => {
    const before = computeAppBuildFingerprint(root);
    put(rel, 'changed');
    expect(computeAppBuildFingerprint(root)).not.toBe(before);
  });

  it('changes when a file is renamed (path is part of the input)', () => {
    const before = computeAppBuildFingerprint(root);
    rmSync(join(root, 'src/app/page.tsx'));
    put('src/app/page2.tsx', 'export const Page = () => null;');
    expect(computeAppBuildFingerprint(root)).not.toBe(before);
  });
});

describe('appBuildFingerprintPlugin', () => {
  it('stamps the fingerprint into <head> as a meta tag, build only', () => {
    const plugin = appBuildFingerprintPlugin(root);
    expect(plugin.apply).toBe('build');
    const hook = plugin.transformIndexHtml as () => unknown;
    expect(hook()).toEqual([
      {
        tag: 'meta',
        attrs: { name: PLUGIN_META_NAME, content: computeAppBuildFingerprint(root) },
        injectTo: 'head',
      },
    ]);
  });

  it('build plugin and runtime read the same meta name', () => {
    expect(PLUGIN_META_NAME).toBe(CLIENT_META_NAME);
  });
});
