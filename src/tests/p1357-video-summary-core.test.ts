/**
 * @file p1357-video-summary-core.test.ts
 * @description P1357: the pure half of the video-summary pipeline — id parsing, caption parsing,
 * writer-output validation, the mechanical check, the checker's verdict (fails closed) and the
 * draft → checked → confirmed transitions.
 */
import { describe, expect, it } from 'vitest';
import {
  checkItems,
  checkerPrompt,
  mechanicalCheck,
  parseCheckerVerdict,
  parseVideoId,
  parseVtt,
  sameVendor,
  toSeconds,
  transitionError,
  validateDraft,
  writerPrompt,
} from '../../scripts/lib/video-summary-core.mjs';

const VTT = `WEBVTT
Kind: captions
Language: en

00:00:05.000 --> 00:00:08.000
hello and welcome

00:00:08.000 --> 00:00:11.000
hello and welcome
to the talk

00:01:05.000 --> 00:01:09.000
<c>the second part</c> starts here
`;

const META = { title: 'A talk', channel: 'Chan', duration: 600 };
const segs = parseVtt(VTT);

const good = {
  tldr: 'A short talk.',
  summary: 'First paragraph.\n\nSecond paragraph.',
  key_points: ['One point here.', 'Two point here.', 'Three point here.'],
  moments: [
    { t: '1:05', note: 'Second part starts' },
    { t: '0:05', note: 'Welcome' },
  ],
};

describe('P1357 — ids and captions', () => {
  it('accepts a bare id and every common URL shape, rejects the rest', () => {
    const id = 'dQw4w9WgXcQ';
    for (const s of [id, `https://www.youtube.com/watch?v=${id}&t=30`, `https://youtu.be/${id}`, `https://m.youtube.com/shorts/${id}`, `https://www.youtube-nocookie.com/embed/${id}`])
      expect(parseVideoId(s)).toBe(id);
    for (const s of ['', 'abc', 'https://vimeo.com/123', `https://www.youtube.com/watch?v=${id}x`, 'dQw4w9WgXc!']) expect(parseVideoId(s)).toBeNull();
  });

  it('parses VTT into timed text, dropping rolled-over duplicates and tags', () => {
    expect(segs).toEqual([
      { t: 5, text: 'hello and welcome' },
      { t: 8, text: 'to the talk' },
      { t: 65, text: 'the second part starts here' },
    ]);
  });

  it('reads mm:ss and h:mm:ss, rejects anything else', () => {
    expect(toSeconds('1:05')).toBe(65);
    expect(toSeconds('1:00:01')).toBe(3601);
    expect(toSeconds(42)).toBe(42);
    for (const bad of ['1:5x', '', 'soon', 2.5, '1:2:3:4']) expect(Number.isNaN(toSeconds(bad))).toBe(true);
  });
});

describe('P1357 — writer output', () => {
  it('the prompt carries the P1349 copyright rule, 3 key points, and no worth_reading', () => {
    const p = writerPrompt(META, segs);
    expect(p).toMatch(/Our own words, never a transcript/);
    expect(p).toMatch(/No claims the speakers did not make/);
    expect(p).toMatch(/exactly 3 items/);
    expect(p).not.toMatch(/worth_reading/);
    expect(p).toContain('[1:05] the second part starts here');
  });

  it('a revision carries every checker failure to the writer; a fresh draft carries none', () => {
    const p = writerPrompt(META, segs, { failures: ['para-1: says he founded X; transcript says led', 'moment-5: starts at 47:57'] });
    expect(p).toMatch(/independent checker rejected/);
    expect(p).toContain('- para-1: says he founded X; transcript says led');
    expect(p).toContain('- moment-5: starts at 47:57');
    expect(writerPrompt(META, segs)).not.toMatch(/checker rejected/);
    // With the previous draft attached, the writer edits it instead of starting over.
    const prev = validateDraft(good, 600).draft;
    const edit = writerPrompt(META, segs, { failures: ['moment-2: wrong'], previous: prev });
    expect(edit).toMatch(/Your previous draft/);
    expect(edit).toContain('"t": "1:05"');
    expect(edit).toMatch(/keep every part the checker did not name word for word/);
  });

  it('accepts a good draft and converts moments to sorted seconds', () => {
    const r = validateDraft(good, 600);
    expect(r.errors).toEqual([]);
    expect(r.draft.moments).toEqual([
      { t: 5, note: 'Welcome' },
      { t: 65, note: 'Second part starts' },
    ]);
  });

  it('rejects the read-first shape (6 key points) and every other broken field, naming each', () => {
    const r = validateDraft(
      {
        tldr: ' ',
        summary: '',
        key_points: ['a', 'b', 'c', 'd', 'e', 'f'],
        moments: [{ t: '99:00', note: 'past the end' }, { t: 'later', note: 'x' }, { t: '0:10', note: '' }],
      },
      600
    );
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'tldr is blank',
        'summary is blank',
        'expected exactly 3 key points, got 6',
        expect.stringMatching(/moment 1 at 99:00 is outside the video/),
        expect.stringMatching(/moment 2 has an unreadable time/),
        'moment 3 has a blank note',
      ])
    );
  });

  it('rejects an overlong key point', () => {
    const r = validateDraft({ ...good, key_points: ['word '.repeat(30), 'b', 'c'] }, 600);
    expect(r.errors).toContain('key point 1 is over 16 words');
  });
});

describe('P1357 — check', () => {
  const draft = validateDraft(good, 600).draft;

  it('mechanical check passes moments near a caption and fails one with no caption nearby', () => {
    expect(mechanicalCheck(draft, segs, 600)).toEqual([]);
    const moved = { ...draft, moments: [...draft.moments, { t: 400, note: 'nothing here' }] };
    expect(mechanicalCheck(moved, segs, 600)).toEqual([expect.stringMatching(/6:40 has no caption within 20s/)]);
  });

  it('the checker gets one item per moment, key point, tldr and paragraph', () => {
    expect(checkItems(draft, 600).map((i) => i.id)).toEqual(['moment-1', 'moment-2', 'key-1', 'key-2', 'key-3', 'tldr', 'para-1', 'para-2']);
    // Each moment is checked over its own span: up to the next moment, the last one to the end.
    expect(checkItems(draft, 600).slice(0, 2).map((i) => [i.t, i.until])).toEqual([['0:05', '1:05'], ['1:05', '10:00']]);
    expect(checkerPrompt(META, segs, draft)).toMatch(/You did not write it/);
  });

  const allPass = (d: typeof draft) => JSON.stringify({ items: checkItems(d).map((i) => ({ id: i.id, verdict: 'pass', reason: '', evidence: '' })) });

  it('passes only when every item passes', () => {
    expect(parseCheckerVerdict(`here you go\n${allPass(draft)}\n`, draft).pass).toBe(true);
  });

  it('reads the answer, not the echoed prompt: Codex prints the prompt (with braces and a schema) first', () => {
    const echoed = `OpenAI Codex v0.155.1\nuser\n${checkerPrompt(META, segs, draft)}\ncodex\n${allPass(draft)}\ntokens used: 1234\n`;
    expect(parseCheckerVerdict(echoed, draft)).toMatchObject({ pass: true, failures: [] });
    const echoedFail = echoed.replace('"id":"para-2","verdict":"pass"', '"id":"para-2","verdict":"fail"');
    expect(parseCheckerVerdict(echoedFail, draft).pass).toBe(false);
  });

  it('fails closed: one fail, a missing id, an unknown verdict, an extra id, no JSON, bad JSON', () => {
    const items = checkItems(draft).map((i) => ({ id: i.id, verdict: 'pass' }));
    const oneFail = JSON.stringify({ items: items.map((i) => (i.id === 'para-2' ? { ...i, verdict: 'fail', reason: 'invented claim', evidence: '1:05' } : i)) });
    expect(parseCheckerVerdict(oneFail, draft).failures).toEqual(['para-2: invented claim (1:05)']);
    expect(parseCheckerVerdict(JSON.stringify({ items: items.slice(1) }), draft).failures).toEqual(['moment-1: checker gave no verdict']);
    expect(parseCheckerVerdict(JSON.stringify({ items: items.map((i) => ({ ...i, verdict: 'maybe' })) }), draft).pass).toBe(false);
    expect(parseCheckerVerdict(JSON.stringify({ items: [...items, { id: 'para-9', verdict: 'pass' }] }), draft).failures).toEqual(['para-9: unexpected id from checker']);
    expect(parseCheckerVerdict('looks fine to me', draft).failures).toEqual(['checker returned no JSON']);
    expect(parseCheckerVerdict('{ items: [ }', draft).failures).toEqual(['checker returned malformed JSON']);
  });

  it('writer and checker must be different vendors', () => {
    expect(sameVendor('gemini:gemini-3.8-flash', 'gemini:gemini-3.5-pro')).toBe(true);
    expect(sameVendor('codex:gpt-5.6-sol', 'gemini:gemini-3.8-flash')).toBe(false);
  });
});

describe('P1357 — transitions: nothing skips a step', () => {
  it('draft → check → confirm, in order only', () => {
    expect(transitionError('draft', undefined)).toBeNull();
    expect(transitionError('draft', 'draft')).toBeNull();
    expect(transitionError('draft', 'confirmed')).toMatch(/--force/);
    expect(transitionError('draft', 'confirmed', { force: true })).toBeNull();
    expect(transitionError('check', 'draft')).toBeNull();
    expect(transitionError('check', 'checked')).toMatch(/needs a draft/);
    expect(transitionError('confirm', 'draft')).toMatch(/needs a checked row/);
    expect(transitionError('confirm', undefined)).toMatch(/found none/);
    expect(transitionError('confirm', 'checked')).toBeNull();
    expect(transitionError('demote', 'confirmed')).toBeNull();
    expect(transitionError('demote', undefined)).toMatch(/no row/);
  });
});
