import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * P1238: validate-features.ts must not abort the whole run on one malformed
 * frontmatter file. Uses the real archived fixture that already carries a
 * duplicate `status:` key (features/archive/p821_letter_reading_progress_bar_disappears_on_scroll.md)
 * rather than a synthetic one — it's the file that surfaced this bug.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, '..', 'validate-features.ts');

function runValidator(): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync('npx', ['tsx', SCRIPT], { encoding: 'utf-8' });
    return { stdout, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number | null };
    return { stdout: (e.stdout ?? '') + (e.stderr ?? ''), exitCode: e.status ?? 1 };
  }
}

describe('p1238: validate-features.ts on a duplicate frontmatter key', () => {
  it('completes with a validation report instead of crashing', () => {
    const { stdout } = runValidator();

    // A crash aborts before this line ever prints — its presence proves the run completed.
    expect(stdout).toContain('=== VALIDATION SUMMARY ===');
  });

  it('reports the malformed file by name and reason instead of aborting silently', () => {
    const { stdout } = runValidator();

    expect(stdout).toContain('p821_letter_reading_progress_bar_disappears_on_scroll.md');
    expect(stdout).toMatch(/duplicate|cannot be parsed|parse error/i);
  });

  it('walks past the malformed file to files that sort after it (does not stop mid-directory)', () => {
    const { stdout } = runValidator();
    const lines = stdout.split('\n');

    // p821 sits alphabetically ahead of the rest of features/archive/ — uat_p617.md is the
    // very next entry the walk visits in the same directory. Order (not mere presence) is
    // what proves the loop advanced past the crash point, since a line can otherwise print
    // before the crash and say nothing about what happens after it.
    const crashIdx = lines.findIndex((l) => l.includes('p821_letter_reading_progress_bar_disappears_on_scroll.md'));
    const nextIdx = lines.findIndex((l) => l.includes('uat_p617.md'));

    expect(crashIdx).toBeGreaterThan(-1);
    expect(nextIdx).toBeGreaterThan(crashIdx);
  });

  it('reports the three pre-existing invalid `type` values in features/archive/ (AC #4)', () => {
    const { stdout } = runValidator();

    // These three sort ahead of p821 in the walk, so this proves AC #4 (existing errors
    // must still be reported, not hidden) — it does NOT prove continuation past the crash
    // point; the test above does that.
    expect(stdout).toContain('p577_uat.md');
    expect(stdout).toContain('p622_uat.md');
    expect(stdout).toContain('p624_understanding_agreement_grid.md');
  });
});
