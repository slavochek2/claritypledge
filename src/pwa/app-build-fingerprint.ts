/**
 * @file app-build-fingerprint.ts
 * @description P1416: a fingerprint of what users actually run, stamped into index.html as
 * `<meta name="app-build">`. BUILD-TIME ONLY — imported by vite.config.ts, never by the app.
 *
 * The update prompt (src/lib/app-update-check.ts) needs "has the app changed since this page
 * loaded?". The entry chunk's hash cannot answer it: every deploy bakes a new Sentry release id
 * (the commit) into the entry, and most deploys change only docs, skills or tests. So this hashes
 * the build's own inputs instead — the files that change the bundle, the shell, or the CSS — and
 * nothing else. A file missing from this list costs a missed prompt (the next app change prompts);
 * a file wrongly on it costs a needless one.
 *
 * Not covered: build-time env values (VITE_*). Changing one without a code change does not prompt.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/** Must equal APP_BUILD_META_NAME in src/lib/app-update-check.ts (asserted by test). */
export const APP_BUILD_META_NAME = 'app-build';

/** Directories whose files are inputs, minus tests. */
const INPUT_DIRS = ['src', 'public'];
/** Single files that change what the build emits. */
const INPUT_FILES = ['index.html', 'package-lock.json', 'vite.config.ts', 'tailwind.config.js', 'postcss.config.js'];

function isTestFile(rel: string): boolean {
  return rel.startsWith('src/tests/') || /\.(test|spec)\.[cm]?[jt]sx?$/.test(rel);
}

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    if (name === '.DS_Store') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
}

/** 16 hex chars over the sorted (path, content) pairs of every input file under `root`. */
export function computeAppBuildFingerprint(root: string): string {
  const files: string[] = [];
  for (const d of INPUT_DIRS) {
    const p = join(root, d);
    if (existsSync(p)) walk(p, files);
  }
  for (const f of INPUT_FILES) {
    const p = join(root, f);
    if (existsSync(p)) files.push(p);
  }
  const entries = files
    .map((abs) => ({ abs, rel: relative(root, abs).split(sep).join('/') }))
    .filter(({ rel }) => !isTestFile(rel))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const hash = createHash('sha256');
  for (const { abs, rel } of entries) {
    hash.update(rel);
    hash.update('\0');
    hash.update(readFileSync(abs));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

export function appBuildFingerprintPlugin(root: string = process.cwd()): Plugin {
  let fingerprint: string | undefined;
  return {
    name: 'p1416-app-build-fingerprint',
    apply: 'build',
    transformIndexHtml() {
      fingerprint ??= computeAppBuildFingerprint(root);
      return [{ tag: 'meta', attrs: { name: APP_BUILD_META_NAME, content: fingerprint }, injectTo: 'head' }];
    },
  };
}
