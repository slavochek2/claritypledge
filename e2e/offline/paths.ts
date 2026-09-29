/**
 * P1369 offline harness — paths, port and the "deploy" pointer. No Supabase imports here: the
 * Playwright config and global setup load this before .env.test.local is applied.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(HERE, '../..');

function hash(s: string): number {
  return Math.abs([...s].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0));
}

/** Per-checkout port and build dir, so two worktrees never share a server or a build. */
export const OFFLINE_PORT = Number(process.env.OFFLINE_PORT) || 6100 + (hash(REPO_ROOT) % 800);
export const BUILD_ROOT =
  process.env.OFFLINE_BUILD_ROOT || path.join(os.tmpdir(), `p1369-offline-${hash(REPO_ROOT)}`);
export const BASE_URL = `http://localhost:${OFFLINE_PORT}`;

/** "Deploy" a build: the server reads this file on every request. */
export function deploy(which: 'a' | 'b') {
  fs.mkdirSync(BUILD_ROOT, { recursive: true });
  fs.writeFileSync(path.join(BUILD_ROOT, 'current'), which);
}

