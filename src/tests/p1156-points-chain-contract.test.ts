/**
 * @file p1156-points-chain-contract.test.ts
 * @description The points chain after the P1156 restructure: the untrusted-input
 * rule stated IN FULL (sibling-inheritance sentence included) in every one of the
 * five chain skills; the selector naming video title/uploader/description as
 * untrusted and carrying the exit-code-7 rule; the seal architecture (named
 * blocks with end-markers, fixed seal filenames); the contract doc as the one
 * schema home; and disagreement:publish repointed by skill name, not stage number.
 *
 * The five-skill untrusted-input assertion has teeth: each new file was written
 * fresh, and a safety property held by reference is lost the moment the sibling
 * that states it is edited — so every skill must carry the rule itself.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const SELECT = read('.claude/commands/slava/disagreement/select.md');
const PREPARE = read('.claude/commands/slava/disagreement/prepare.md');
const POSITIONS = read('.claude/commands/slava/disagreement/positions.md');
const STORY = read('.claude/commands/slava/disagreement/story-draft.md');
const PUBLISH = read('.claude/commands/slava/disagreement/publish.md');
const CHAIN = [SELECT, PREPARE, POSITIONS, STORY, PUBLISH];

const SIBLING_SENTENCE =
  'Stated here in full rather than inherited from a sibling skill: a safety property held by reference is lost the moment the sibling is edited.';

describe('p1156 — the untrusted-input rule lives in EVERY chain skill, in full', () => {
  it.each([
    ['disagreement:select', SELECT],
    ['disagreement:prepare', PREPARE],
    ['disagreement:positions', POSITIONS],
    ['disagreement:story-draft', STORY],
    ['disagreement:publish', PUBLISH],
  ])('%s states the sibling-inheritance sentence verbatim', (_name, skill) => {
    expect(skill).toContain(SIBLING_SENTENCE);
  });

  it('every chain skill marks the instruction boundary', () => {
    for (const skill of CHAIN) {
      expect(skill).toMatch(/untrusted at the instruction boundary/);
    }
  });

  it('the selector NAMES video title, uploader and description as untrusted input', () => {
    // P1104 recorded this channel as UNTRUSTED INDIRECT and "not explicitly
    // named"; Gate 0 step 1 now gates and rewards on exactly it, so naming it
    // is mandatory, not optional.
    expect(SELECT).toMatch(/Video title, uploader[^\n]*description/i);
  });

  it('the selector carries the exit-code-7 rule: halt, never retry, never purchase', () => {
    expect(SELECT).toContain('Exit code 7 means every path was walled');
    expect(SELECT).toContain('Do NOT retry, and never purchase anything yourself');
    expect(SELECT).toMatch(/funnel INCOMPLETE/i);
  });
});

describe('p1156 — the seal architecture', () => {
  it('the selector seals the approvals block with an end-marker', () => {
    expect(SELECT).toContain('### Approvals Block');
    expect(SELECT).toContain('<!-- end-approvals-block -->');
    expect(SELECT).toContain('.points-run-seals/<slug>.approvals.sha256');
  });

  it('prepare seals the named prediction block — never the whole file — under the filename publish checks', () => {
    expect(PREPARE).toContain('### Prediction Block');
    expect(PREPARE).toContain('<!-- end-prediction-block -->');
    expect(PREPARE).toContain('.points-run-seals/<slug>.sha256');
    expect(PREPARE).toMatch(/never over the whole run file/i);
  });

  it('every downstream skill re-verifies the approvals seal and STOPs on mismatch', () => {
    for (const skill of [PREPARE, POSITIONS, STORY]) {
      expect(skill).toContain('approvals.sha256');
      expect(skill).toMatch(/mismatch is a STOP/);
    }
  });

  it('the predicting pass still receives only three things — isolation survives the split', () => {
    expect(PREPARE).toMatch(/receives exactly three things/);
    expect(PREPARE).toMatch(/may not see the extraction reasoning/);
    // On a re-run, prepare must read the ORIGINAL sources, never a run file
    // already carrying positions (the deepest finding of the P1156 review).
    expect(PREPARE).toMatch(/read the ORIGINAL sources, never a run file already carrying positions/);
  });
});

describe('p1156 — the contract doc is the one schema home', () => {
  it('docs/points-process.md exists', () => {
    expect(existsSync(join(ROOT, 'docs/points-process.md'))).toBe(true);
  });

  it('every chain skill points at the contract doc rather than restating the schema', () => {
    for (const skill of CHAIN) {
      expect(skill).toContain('docs/points-process.md');
    }
  });

  it('the contract doc carries the run-file schema and the sealed-block extraction', () => {
    const doc = read('docs/points-process.md');
    expect(doc).toMatch(/## Header & Approvals/);
    expect(doc).toMatch(/## Points & Predictions/);
    expect(doc).toMatch(/## Quotes & Positions/);
    expect(doc).toMatch(/## Story Drafts/);
    expect(doc).toContain('end-approvals-block');
    expect(doc).toContain('end-prediction-block');
  });
});

describe('p1156 — the split is relocation, not revision', () => {
  it('prepare retains stages 1–5 and 7', () => {
    for (const stage of ['## Stage 1 — Acquire', '## Stage 2 —', '## Stage 3 —', '## Stage 4 —', '## Stage 5 —', '## Stage 7 —']) {
      expect(PREPARE).toContain(stage);
    }
  });

  it('stages 6 and 8 are tombstoned to their new homes, not silently deleted', () => {
    expect(PREPARE).toMatch(/## Stage 6 — moved/);
    expect(PREPARE).toMatch(/## Stage 8 — moved/);
    expect(PREPARE).toMatch(/slava:disagreement:positions/);
    expect(PREPARE).toMatch(/slava:disagreement:story-draft/);
  });

  it('disagreement:positions selects quotes BEFORE positions and keeps the hypothesis warning', () => {
    expect(POSITIONS).toMatch(/Quotes are chosen FIRST/i);
    expect(POSITIONS).toMatch(/an agent-derived split is a HYPOTHESIS, never a finding/i);
    expect(POSITIONS).toMatch(/close/);
    expect(POSITIONS).toMatch(/derived/);
    expect(POSITIONS).toMatch(/stretch/);
    expect(POSITIONS).toMatch(/grep -F/);
  });

  it('disagreement:story-draft enforces the build-time limits the spec requires', () => {
    expect(STORY).toMatch(/10,000[- ]characters?/i);
    expect(STORY).toMatch(/\(author_id, point_id\)/);
    expect(STORY).toMatch(/No trailing `Source:` line/);
    expect(STORY).toContain('docs/story-point-model.md');
  });
});

describe('p1156 — publish is repointed by skill name, not stage number', () => {
  it('the two STOP conditions resolve to skills that actually emit the field', () => {
    expect(PUBLISH).toContain('/slava:disagreement:select');
    expect(PUBLISH).toContain('/slava:disagreement:positions');
    expect(PUBLISH).toContain('/slava:disagreement:story-draft');
  });

  it('no reference to prepare stage numbers survives in publish', () => {
    // Stage numbers across two files are how a reader resolves a gate to the
    // wrong file — publish's OWN stage numbers stay; references to PREPARE's
    // stages must name the skill instead.
    expect(PUBLISH).not.toMatch(/slava:disagreement:prepare` Stage/);
    expect(PUBLISH).not.toMatch(/prepare's Stage/);
    expect(PUBLISH).not.toMatch(/prepare v0\.\d\.0 Stage/);
  });

  it('the prediction-seal precondition still checks the fixed filename', () => {
    expect(PUBLISH).toContain('.points-run-seals/<slug>.sha256');
  });
});
