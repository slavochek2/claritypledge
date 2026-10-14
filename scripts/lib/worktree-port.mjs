// The ONE definition of a checkout's dev-server / e2e port (P1480).
//
// Callers: vite.config.ts (server.port), playwright.config.ts (baseURL + webServer),
// e2e/save-auth.ts, and scripts/check-worktree-env.sh (via the CLI below, no build step).
// It used to be written out in each of them, and the copies had already drifted (the
// checker had no legacy branch). Change the scheme here and nowhere else;
// src/tests/p1480-worktree-ports.test.ts fails if a caller grows its own copy again.
//
// Scheme:
//   main checkout                      5001  (5000 is taken by macOS AirPlay)
//   .claude/worktrees/wN               5000 + N*100
//   legacy sibling claritypledge-N     5000 + N*100
//   .claude/worktrees/<name>           5800 + hash(name) % 100
// then, if the result is a port browsers refuse, it moves by RESTRICTED_PORT_SHIFT.
// The only slot that moves today is w10 (6000 -> 6050); every other port is unchanged.

import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fetch standard "bad port" list — https://fetch.spec.whatwg.org/#port-blocking
// Chromium refuses these with net::ERR_UNSAFE_PORT before sending a request. Measured against
// Playwright's Chromium 156 for ports 1..15000: it blocks this list minus 4190 and 6679, so the
// spec list is the safe superset. A future browser addition is a one-line change here.
export const CHROMIUM_RESTRICTED_PORTS = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
]);

// Half a slot's stride: a shifted port can never equal another slot's 5000 + N*100, and 6050
// sits outside the 5800-5899 hash range.
export const RESTRICTED_PORT_SHIFT = 50;

export const MAIN_PORT = 5001;

/**
 * Slot name for a checkout directory: "wN", "legacyN", a named worktree's directory name, or
 * null for the main checkout. vite.config.ts keys its dep-cache directory on this string.
 */
export function worktreeSlot(dir) {
  const resolved = path.resolve(dir);
  const slotMatch = resolved.match(/[/\\](w\d+)$/);
  if (slotMatch) return slotMatch[1];
  const legacyMatch = resolved.match(/claritypledge-(\d+)$/);
  if (legacyMatch) return `legacy${legacyMatch[1]}`;
  const namedMatch = resolved.match(/[/\\]worktrees[/\\]([^/\\]+)$/);
  if (namedMatch) return namedMatch[1];
  return null;
}

function rawPortForSlot(slot) {
  if (!slot) return MAIN_PORT;
  const numMatch = slot.match(/^w(\d+)$/) || slot.match(/^legacy(\d+)$/);
  if (numMatch) return 5000 + parseInt(numMatch[1], 10) * 100;
  const hash = [...slot].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  return 5800 + (Math.abs(hash) % 100);
}

/** The port for a slot name as returned by worktreeSlot(). */
export function portForSlot(slot) {
  const port = rawPortForSlot(slot);
  if (!CHROMIUM_RESTRICTED_PORTS.has(port)) return port;
  const shifted = port + RESTRICTED_PORT_SHIFT;
  // Fail loudly rather than hand out a second unusable port if the list ever grows into it.
  if (CHROMIUM_RESTRICTED_PORTS.has(shifted)) {
    throw new Error(
      `worktree-port: ${port} and ${shifted} are both browser-restricted (slot ${slot}) — ` +
        'pick a new RESTRICTED_PORT_SHIFT in scripts/lib/worktree-port.mjs',
    );
  }
  return shifted;
}

/** The dev/e2e port for a checkout directory. */
export function worktreePort(dir) {
  return portForSlot(worktreeSlot(dir));
}

// CLI for shell callers: `node scripts/lib/worktree-port.mjs [dir]` prints the port for dir
// (default: the current directory, matching how vite.config.ts reads process.cwd()).
// Both sides are canonicalised: Node resolves the main module's symlinks for import.meta.url but
// leaves argv[1] as typed, so a symlinked path (a linked scripts/ dir, macOS /tmp) would
// otherwise fail the comparison and print nothing.
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

// Written as a plain string, never console.log(<number>): Node colours a logged number when
// FORCE_COLOR is set, and Playwright sets FORCE_COLOR for its webServer child, so the port
// reached check-worktree-env.sh wrapped in ANSI codes and failed its digits-only guard (P1492).
if (isEntryPoint()) {
  process.stdout.write(`${worktreePort(process.argv[2] ?? process.cwd())}\n`);
}
