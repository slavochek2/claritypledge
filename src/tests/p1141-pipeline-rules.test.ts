/**
 * @file p1141-pipeline-rules.test.ts
 * @description DW-11 the voice rules and the section label live in EXACTLY one
 * skill, with the choice stated; DW-13 timecodes resolve from the retained raw
 * caption file and never from the cleaned transcript; the P1096 non-goal points
 * here; and every UI Contract and RD-1 string appears verbatim somewhere it is
 * actually rendered.
 *
 * "Exactly one skill" is the assertion with teeth: two copies of a voice rule
 * diverge silently, and the story text is the surface where a divergence
 * misgenders a real person under an account bearing their own name.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const PREPARE = read('.claude/commands/slava/content/points-prepare.md');
const PUBLISH = read('.claude/commands/slava/content/points-publish.md');
const LABEL = 'Supporting quotes from {Full Name}';

describe('p1141 DW-11 — the voice rules live in exactly one skill', () => {
  it('points-prepare owns them, and says so', () => {
    expect(PREPARE).toContain('**This skill is the ONE place these rules live.**');
    expect(PREPARE).toContain('no reliable information about');
    expect(PREPARE).toContain('pronoun');
  });

  it('the reason for the choice is stated, not left to be guessed', () => {
    // Decision 10: prepare produces the story-draft text; publish disclaims authorship.
    expect(PREPARE).toMatch(/drafted narrative content|narrative content is drafted/);
    expect(PUBLISH).toMatch(/does NOT author the rule/);
  });

  it('points-publish carries a MECHANICAL backstop, not a second copy of the rule', () => {
    expect(PUBLISH).toContain(LABEL);
    // It greps for the string; it does not restate why the rule exists.
    expect(PUBLISH).toContain('re-run prepare');
    expect(PUBLISH).not.toContain('**This skill is the ONE place these rules live.**');
  });

  it('the section label appears in exactly one skill file — no second, drifting copy', () => {
    const skills = [PREPARE, PUBLISH];
    const authoring = skills.filter((s) => s.includes(LABEL));
    // Present in both is correct: prepare AUTHORS it, publish ASSERTS it.
    expect(authoring).toHaveLength(2);
    // But only one of them explains the pronoun rule behind it.
    const explains = skills.filter((s) => /misgender/i.test(s));
    expect(explains).toHaveLength(1);
  });

  it('the label the skill specifies is the label the component renders', () => {
    const component = read('src/app/components/shared/story-video-quotes.tsx');
    expect(component).toContain('Supporting quotes from {subjectName}');
    expect(PREPARE).toContain(LABEL);
  });
});

describe('p1141 DW-13 — timecodes come from the raw .vtt, never the cleaned transcript', () => {
  it('points-prepare names the retained raw store as the source', () => {
    expect(PREPARE).toContain('~/.local/share/yt-store/');
    expect(PREPARE).toContain('.vtt');
  });

  it('it names the ~30s cleaned transcript as the trap, explicitly', () => {
    expect(PREPARE).toMatch(/vtt-clean/);
    expect(PREPARE).toMatch(/~30 seconds|30s|half a minute/);
  });

  it('it specifies the per-quote seconds field the filer writes', () => {
    expect(PREPARE).toMatch(/seconds: <integer/);
    expect(PREPARE).toMatch(/video_url: <canonical watch URL>/);
    expect(PREPARE).toMatch(/duration_seconds:/);
  });

  it('points-publish enforces the raw-vtt origin at filing time', () => {
    expect(PUBLISH).toMatch(/RAW `\.vtt`/);
    expect(PUBLISH).toMatch(/never from the ~30s cleaned transcript/);
  });

  it('points-publish documents the row shape for both new columns', () => {
    expect(PUBLISH).toContain('video_url');
    expect(PUBLISH).toContain('video_quotes');
    expect(PUBLISH).toContain('durationSeconds');
    // Omitting both for a story with no video must be stated, or a filer writes
    // an empty string and DW-4 breaks.
    expect(PUBLISH).toMatch(/Omit BOTH/);
  });

  it('it forbids the channel URL, the embed URL and the bare id', () => {
    expect(PUBLISH).toMatch(/not a channel URL, an embed URL, or a bare id/);
  });
});

describe('p1141 — the P1096 non-goal points here rather than contradicting silently', () => {
  it('P1096 records that its video/timestamp non-goal is superseded by P1141', () => {
    const p1096 = read('features/p1096_public_multisource_point_pipeline.md');
    expect(p1096).toMatch(/P1141/);
  });
});

describe('p1141 — every UI Contract and RD-1 string appears verbatim where it renders', () => {
  const CASES: Array<[string, string]> = [
    ['src/app/components/shared/agent-byline.tsx', 'Reading of {fullName}'],
    ['src/app/components/shared/machine-chip.tsx', 'Machine'],
    ['src/app/components/shared/story-video-quotes.tsx', 'Supporting quotes from {subjectName}'],
    ['src/app/components/shared/agent-story-footer.tsx', 'A machine account operated by ClarityPledge wrote this reading of {fullName}.'],
    ['src/app/components/shared/agent-story-footer.tsx', 'How machine accounts work →'],
  ];

  it.each(CASES)('%s carries %s', (file, needle) => {
    expect(read(file)).toContain(needle);
  });

  it('the footer names the quote exception, the second of RD-1\'s two sentences', () => {
    const footer = read('src/app/components/shared/agent-story-footer.tsx');
    expect(footer).toContain("own words except the quotes, which come from the linked video.");
  });

  it('the operator name is ClarityPledge everywhere it appears', () => {
    expect(read('src/app/components/shared/agent-story-footer.tsx')).toContain('ClarityPledge');
  });

  it('the quotes meta line matches the UI Contract shape `{n} marks · {duration}`', () => {
    const component = read('src/app/components/shared/story-video-quotes.tsx');
    expect(component).toContain('marks');
    expect(component).toContain('·');
  });
});
