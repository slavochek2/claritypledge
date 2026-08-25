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
 *
 * P1156 (2026-08-25) moved the voice rules from points-prepare to story-create
 * and the timecode emission from prepare Stage 8 to positions-create. The
 * assertions follow the rules to their new homes; publish's assertions are
 * unchanged because its gates are unchanged.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const PREPARE = read('.claude/commands/slava/content/points-prepare.md');
const PUBLISH = read('.claude/commands/slava/content/points-publish.md');
const POSITIONS = read('.claude/commands/slava/content/positions-create.md');
const STORY = read('.claude/commands/slava/content/story-create.md');
const LABEL = 'Supporting quotes from {Full Name}';

describe('p1141 DW-11 — the voice rules live in exactly one skill', () => {
  it('story-create owns them, and says so', () => {
    expect(STORY).toContain('**This skill is the ONE place these rules live.**');
    expect(STORY).toContain('no reliable information about');
    expect(STORY).toContain('pronoun');
  });

  it('the reason for the choice is stated, not left to be guessed', () => {
    // Decision 10: story-create produces the story-draft text; publish disclaims authorship.
    expect(STORY).toMatch(/drafted narrative content|narrative content is drafted/);
    expect(PUBLISH).toMatch(/does NOT author the rule/);
  });

  it('points-publish carries a MECHANICAL backstop, not a second copy of the rule', () => {
    expect(PUBLISH).toContain(LABEL);
    // It greps for the string; it does not restate why the rule exists.
    expect(PUBLISH).toContain('re-run story-create');
    expect(PUBLISH).not.toContain('**This skill is the ONE place these rules live.**');
  });

  it('the section label appears in exactly one skill file — no second, drifting copy', () => {
    const skills = [PREPARE, POSITIONS, STORY, PUBLISH];
    const authoring = skills.filter((s) => s.includes(LABEL));
    // Present in story-create AND publish is correct: story-create AUTHORS it,
    // publish ASSERTS it. The other two chain skills must not carry it at all.
    expect(authoring).toHaveLength(2);
    expect(authoring).toContain(STORY);
    expect(authoring).toContain(PUBLISH);
    // But only one of them explains the pronoun rule behind it.
    const explains = skills.filter((s) => /misgender/i.test(s));
    expect(explains).toHaveLength(1);
    expect(explains).toContain(STORY);
  });

  it('the label the skill specifies is the label the component renders', () => {
    const component = read('src/app/components/shared/story-video-quotes.tsx');
    expect(component).toContain('Supporting quotes from {subjectName}');
    expect(STORY).toContain(LABEL);
  });
});

describe('p1141 DW-13 — timecodes come from the raw .vtt, never the cleaned transcript', () => {
  it('positions-create names the retained raw store as the source', () => {
    expect(POSITIONS).toContain('~/.local/share/yt-store/');
    expect(POSITIONS).toContain('.vtt');
  });

  it('it names the ~30s cleaned transcript as the trap, explicitly', () => {
    expect(POSITIONS).toMatch(/vtt-clean/);
    expect(POSITIONS).toMatch(/~30 seconds|30s|half a minute/);
  });

  it('it specifies the per-quote seconds field the filer writes', () => {
    expect(POSITIONS).toMatch(/seconds: <integer/);
    expect(POSITIONS).toMatch(/video_url: <canonical watch URL>/);
    expect(POSITIONS).toMatch(/duration_seconds:/);
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
    // Amended 2026-08-24 with the spec's UI Contract: the byline is now
    // `[MACHINE] reading of {Full Name}` with the name as the only link, so the
    // rendered literal is the lowercase connective and the name is its own element.
    ['src/app/components/shared/agent-byline.tsx', 'reading of'],
    ['src/app/components/shared/machine-chip.tsx', 'Machine'],
    ['src/app/components/shared/story-video-quotes.tsx', 'Supporting quotes from {subjectName}'],
    ['src/app/components/shared/agent-story-footer.tsx', 'A machine account operated by ClarityPledge wrote this reading of {fullName}.'],
    ['src/app/components/shared/agent-story-footer.tsx', 'How machine accounts work →'],
  ];

  it.each(CASES)('%s carries %s', (file, needle) => {
    expect(read(file)).toContain(needle);
  });

  it("the footer names the quote exception, the second of RD-1's two sentences", () => {
    // Asserted on the RENDERED text, not the source: the sentence is now built
    // from a conditional (a no-quotes story must not claim quotes exist — blind
    // review round 3, defect 1), so it is split across JSX lines in the file
    // while still reaching the reader verbatim. The reader is what RD-1 binds.
    const footer = read('src/app/components/shared/agent-story-footer.tsx');
    expect(footer).toContain('own words except the quotes, which come from the linked');
    expect(footer).toContain('video.');
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
