/**
 * @file run-ledger.ts
 * @description P1532: the ids of every user the e2e helpers created during one Playwright run, so
 * the run's global teardown can delete whatever is still alive (pooled users, and users a timed-out
 * test or dead worker never cleaned up) in a few batched requests, instead of leaving them for a
 * sweep six hours later.
 *
 * The run id is set once in playwright.config.ts; workers inherit it through the environment. Each
 * worker appends to its own file (one per pid), so no two processes write the same file. Without a
 * run id (the Vitest integration lane, an ad-hoc script) nothing is recorded, and the helpers fall
 * back to deleting users at once instead of pooling them.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const RUN_ID_ENV = 'P1532_E2E_RUN_ID';

export function currentRunId(): string | undefined {
  return process.env[RUN_ID_ENV] || undefined;
}

export function ledgerDir(runId: string): string {
  return path.join(os.tmpdir(), 'cp-e2e-user-ledger', runId);
}

/** Record a user this process created. A write failure only costs the early cleanup. */
export function recordCreatedUser(userId: string): void {
  const runId = currentRunId();
  if (!runId) return;
  try {
    const dir = ledgerDir(runId);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${process.pid}.ids`), `${userId}\n`);
  } catch (err) {
    console.warn('[TEST HELPER] run ledger write failed (the 6h sweep still catches the user):', (err as Error).message);
  }
}

/** Every id recorded for this run, deduplicated. */
export function readLedger(runId: string): string[] {
  const dir = ledgerDir(runId);
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.ids'));
  } catch {
    return [];
  }
  const ids = new Set<string>();
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (line.trim()) ids.add(line.trim());
    }
  }
  return [...ids];
}

export function removeLedger(runId: string): void {
  fs.rmSync(ledgerDir(runId), { recursive: true, force: true });
}
