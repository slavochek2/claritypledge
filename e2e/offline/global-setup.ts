/**
 * P1369 offline harness: build A (the repo as-is) and build B (same code, every chunk renamed)
 * into BUILD_ROOT, then "deploy" A.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { BUILD_ROOT, REPO_ROOT, deploy } from './paths';

function build(outDir: string, extraArgs: string[]) {
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', ...extraArgs], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    // No Sentry upload from a harness build.
    env: { ...process.env, SENTRY_AUTH_TOKEN: '' },
  });
  if (!fs.existsSync(path.join(outDir, 'index.html')) || !fs.existsSync(path.join(outDir, 'sw.js'))) {
    throw new Error(`offline harness: build into ${outDir} produced no index.html/sw.js`);
  }
}

export default async function globalSetup() {
  const a = path.join(BUILD_ROOT, 'a');
  const b = path.join(BUILD_ROOT, 'b');
  const reuse = process.env.OFFLINE_REUSE_BUILD === '1' && fs.existsSync(path.join(a, 'sw.js')) && fs.existsSync(path.join(b, 'sw.js'));
  if (!reuse) {
    build(a, []);
    build(b, ['--config', path.join(REPO_ROOT, 'e2e/offline/vite.build-b.config.ts')]);
  }
  const bIndex = fs.readFileSync(path.join(b, 'index.html'), 'utf8');
  if (!/-b\.js/.test(bIndex)) throw new Error('offline harness: build B entry is not renamed; deploy swap would be vacuous');
  deploy('a');
}
