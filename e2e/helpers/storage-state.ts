/**
 * @file storage-state.ts
 * @description P1231: seed the first-run tutorial gate for every Playwright context.
 *
 * `IntensityTutorialModal` (src/app/components/letters/intensity-tutorial-modal.tsx) is a
 * hard-mandatory dialog — ESC and backdrop dismissal are blocked and there is no close X.
 * It opens whenever the letter flow enters `point-engage`/`remaining-point-engage` and the
 * localStorage key below is unset (letter-flow-content.tsx:218-224, via
 * src/hooks/use-intensity-preview-seen.tsx). Every fresh browser context starts with empty
 * localStorage, so it fired on every test that reached an engage phase, and as a Radix
 * dialog it removes the real buttons from the accessibility tree beneath it.
 *
 * The 2026-08-31 overnight run measured ~155 failures across ~19 letter-flow spec files
 * caused by this one dialog, and `grep -rl` confirmed **no spec file anywhere seeded or
 * dismissed the key** (docs/technical/e2e-triage-2026-09-01.md).
 *
 * Seeding it here makes the default E2E persona a RETURNING user, which is what all but one
 * of those specs actually mean to exercise. A test that needs the first-run dialog must opt
 * back in with `clearTutorialSeen(page)` before navigating — see p1231-intensity-tutorial-gate.spec.ts.
 *
 * Scope of this change, established by grep rather than assumed: the key is read in exactly
 * one source file (use-intensity-preview-seen.tsx) and asserted by no test. Nothing else
 * observes it.
 *
 * Coverage of `browser.newContext()` was MEASURED, not assumed (Playwright 1.57): contexts
 * built by hand inside a test inherit `use.storageState` too — Playwright applies the config's
 * context options to them. A probe read back the identical config-generated timestamp from a
 * default `page` and from a manual context. An earlier draft of this file shipped a helper for
 * manual contexts on the assumption that they did NOT inherit it; the probe disproved that and
 * the helper was deleted. If a future Playwright version changes this, the letter-flow specs
 * that build their own contexts (p745, p412, p272) are where it will surface.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Mirrors SEEN_KEY in src/hooks/use-intensity-preview-seen.tsx. Keep in sync. */
export const TUTORIAL_SEEN_KEY = 'letter_intensity_preview_seen_at_v2';

interface StorageStateOrigin {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
}

interface StorageStateFile {
  cookies: unknown[];
  origins: StorageStateOrigin[];
}

/**
 * Builds the storageState Playwright hands to every context created through the
 * `page`/`context` fixtures: the saved auth state when one exists, plus the tutorial gate.
 *
 * Returns a path rather than an object because `use.storageState` accepts either, and a
 * path keeps the generated artifact inspectable when a test surprises someone.
 *
 * @param port      dev-server port — the localStorage origin must match baseURL exactly
 * @param authFile  path to the `npm run test:save-auth` output, merged when present
 * @param outDir    directory for the generated file (gitignored)
 */
export function buildE2EStorageState(port: number, authFile: string, outDir: string): string {
  const base: StorageStateFile =
    fs.existsSync(authFile)
      ? (JSON.parse(fs.readFileSync(authFile, 'utf8')) as StorageStateFile)
      : { cookies: [], origins: [] };

  base.cookies ??= [];
  base.origins ??= [];

  const origin = `http://localhost:${port}`;
  let entry = base.origins.find((o) => o.origin === origin);
  if (!entry) {
    entry = { origin, localStorage: [] };
    base.origins.push(entry);
  }
  entry.localStorage ??= [];

  // Upsert — never blindly push, or a re-run against an auth file that already carries the
  // key would produce a duplicate name whose winner is undefined.
  const seeded = { name: TUTORIAL_SEEN_KEY, value: String(Date.now()) };
  const existing = entry.localStorage.findIndex((i) => i.name === TUTORIAL_SEEN_KEY);
  if (existing >= 0) entry.localStorage[existing] = seeded;
  else entry.localStorage.push(seeded);

  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `e2e-storage-state.${port}.json`);

  // Write-then-rename: the config is evaluated once per worker, so up to `workers`
  // processes race on this path. The content is deterministic apart from the timestamp,
  // but a reader catching a half-written file would fail with a JSON parse error rather
  // than anything diagnosable. Rename is atomic within a filesystem.
  const tmpFile = `${outFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(base, null, 2));
  fs.renameSync(tmpFile, outFile);

  return outFile;
}

/**
 * Opt back IN to the first-run dialog. Must run before the navigation that reaches an
 * engage phase, because the gate is read during the initial render of the letter flow.
 */
export async function clearTutorialSeen(page: {
  addInitScript: (fn: (key: string) => void, arg: string) => Promise<void>;
}): Promise<void> {
  await page.addInitScript((key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to clear.
    }
  }, TUTORIAL_SEEN_KEY);
}
