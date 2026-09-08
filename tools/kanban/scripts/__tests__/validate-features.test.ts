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

  it('still validates files after the malformed one (pre-existing invalid types surface)', () => {
    const { stdout } = runValidator();

    // These three were reported before the crash point on the old code path (per P1238 spec);
    // proving they still appear confirms the loop didn't stop at the malformed file.
    expect(stdout).toContain('p577_uat.md');
    expect(stdout).toContain('p622_uat.md');
    expect(stdout).toContain('p624_understanding_agreement_grid.md');
  });
});
