// The ONE definition of a checkout's dev-server / e2e port (P1480).
//
// Callers: vite.config.ts (server.port), playwright.config.ts (baseURL + webServer),
// e2e/save-auth.ts, and scripts/check-worktree-env.sh (via the CLI below, no build step).
// It used to be written out in each of them, and the copies had already drifted (the
// checker had no legacy branch). Change the scheme here and nowhere else;
// src/tests/p1480-worktree-ports.test.ts fails if a caller grows its own copy again.
//
// Scheme (P1705):
//   main checkout                      5001  (5000 is taken by macOS AirPlay)
//   .claude/worktrees/wN               5000 + N*100, 1 <= N <= MAX_SLOT (49; top port 9900)
//   legacy sibling claritypledge-N     5000 + N*100, same cap
//   .claude/worktrees/<name>           5801 + hash(name) % 99  (5801..5899, never 5800 = w8)
// then, if the result is a browser-restricted port (CHROMIUM_RESTRICTED_PORTS) or a Mac-reserved
// one (MAC_RESERVED_PORTS: 5000 and 7000, macOS AirPlay), it moves by RESTRICTED_PORT_SHIFT.
// Slots that move: w10 (6000 -> 6050) and w20 (7000 -> 7050).
//
// Origin sets, both derived here and nowhere else:
//   slotOrigins()  main and w1..w49 after shifts (the GCS CORS lists)
//   devOrigins()   slotOrigins, every possible named port, and for each of those base ports the
//                  E2E load-test ports base+1..base+LOADTEST_MAX_LEVEL (edge-function CORS, via the
//                  generated supabase/functions/_shared/dev-origins.ts)
// Every port in either set is four digits (1024..9999).

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

// Highest numbered slot (wN and legacyN). 5000 + 49*100 = 9900: four digits, which TEST's email
// template needs, and below the restricted 10080.
export const MAX_SLOT = 49;

// Ports macOS itself holds (AirPlay Receiver), so a dev server cannot start on them. Kept apart
// from CHROMIUM_RESTRICTED_PORTS, which a test pins to the Fetch standard list.
export const MAC_RESERVED_PORTS = new Set([5000, 7000]);

// Highest E2E load-test run index (scripts/lib/e2e-loadtest.mjs: loadTestPort = base + index).
export const LOADTEST_MAX_LEVEL = 9;

const NAMED_BASE = 5801;
const NAMED_COUNT = 99;

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
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    if (n < 1 || n > MAX_SLOT) {
      throw new Error(
        `worktree-port: slot ${slot} is outside 1..${MAX_SLOT} (MAX_SLOT in scripts/lib/worktree-port.mjs)`,
      );
    }
    return 5000 + n * 100;
  }
  const hash = [...slot].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
  return NAMED_BASE + (Math.abs(hash) % NAMED_COUNT);
}

const isUnusable = (port) => CHROMIUM_RESTRICTED_PORTS.has(port) || MAC_RESERVED_PORTS.has(port);

/** The port for a slot name as returned by worktreeSlot(). */
export function portForSlot(slot) {
  const port = rawPortForSlot(slot);
  if (!isUnusable(port)) return port;
  const shifted = port + RESTRICTED_PORT_SHIFT;
  // Fail loudly rather than hand out a second unusable port if the lists ever grow into it.
  if (isUnusable(shifted)) {
    throw new Error(
      `worktree-port: ${port} and ${shifted} are both unusable (slot ${slot}) — ` +
        'pick a new RESTRICTED_PORT_SHIFT in scripts/lib/worktree-port.mjs',
    );
  }
  return shifted;
}

function assertFourDigits(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 9999) {
    throw new Error(`worktree-port: port ${port} is not four digits (1024..9999)`);
  }
  return port;
}

const originOf = (port) => `http://localhost:${assertFourDigits(port)}`;

function slotPorts() {
  const ports = [MAIN_PORT];
  for (let n = 1; n <= MAX_SLOT; n++) ports.push(portForSlot(`w${n}`));
  return ports;
}

function namedPorts() {
  const ports = [];
  for (let i = 0; i < NAMED_COUNT; i++) {
    const raw = NAMED_BASE + i;
    ports.push(isUnusable(raw) ? raw + RESTRICTED_PORT_SHIFT : raw);
  }
  return ports;
}

/** Sorted origins for the main checkout and w1..wMAX_SLOT (after shifts): the exact GCS lists. */
export function slotOrigins() {
  return [...new Set(slotPorts())].sort((a, b) => a - b).map(originOf);
}

/** Sorted unique origins a dev server or its E2E load-test runs can be on (edge-function CORS). */
export function devOrigins() {
  const ports = new Set();
  for (const base of [...slotPorts(), ...namedPorts()]) {
    for (let k = 0; k <= LOADTEST_MAX_LEVEL; k++) ports.add(base + k);
  }
  return [...ports].sort((a, b) => a - b).map(originOf);
}

/** Full content of supabase/functions/_shared/dev-origins.ts (edge functions cannot import scripts/). */
export function devOriginsTs() {
  const lines = devOrigins().map((o) => `  '${o}',`).join('\n');
  return (
    '// GENERATED from scripts/lib/worktree-port.mjs — do not edit. Regenerate:\n' +
    '// node scripts/lib/worktree-port.mjs --dev-origins-ts > supabase/functions/_shared/dev-origins.ts\n' +
    '// (src/tests/p1705-dev-origins.test.ts fails on any difference)\n' +
    'export const DEV_ORIGINS: ReadonlySet<string> = new Set([\n' +
    lines +
    '\n]);\n\n' +
    'export function isDevOrigin(origin: string): boolean {\n' +
    '  return DEV_ORIGINS.has(origin);\n' +
    '}\n'
  );
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
  const arg = process.argv[2];
  if (arg === '--max-slot') process.stdout.write(`${MAX_SLOT}\n`);
  else if (arg === '--dev-origins-ts') process.stdout.write(devOriginsTs());
  else process.stdout.write(`${worktreePort(arg ?? process.cwd())}\n`);
}
