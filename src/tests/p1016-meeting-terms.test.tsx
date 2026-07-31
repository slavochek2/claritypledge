/**
 * @file p1016-meeting-terms.test.tsx
 * @description Guards the central architectural constraint of P1016: the two
 * pledge-sourced rungs of the meeting-terms ladder must render the REAL pledge
 * text, not a copy of it.
 *
 * Level 2 = the pledge before the number upgrade (PLEDGE_VERSIONS[3]).
 * Level 3 = the current pledge, whose oath body IS VERIFIED_UNDERSTANDING_OATH[5].
 *
 * These assertions compare against the constants themselves, never against a
 * string literal repeated here — a test with the text pasted into it would pass
 * happily while the page and the live pledge drifted apart, which is exactly the
 * failure this guards.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  sectionsForLevel,
  MEETING_TERMS_LADDER,
  MEETING_TERMS_LEVELS,
  MEETING_TERMS_PLEDGE_SOURCE,
  type MeetingTermsLevel,
} from '@/app/content/meeting-terms';
import { CertificateOathBody } from '@/app/components/agreements/certificate-frame';
import { PLEDGE_VERSIONS, CURRENT_PLEDGE_VERSION } from '@/app/content/pledge-text';
import { VERIFIED_UNDERSTANDING_OATH } from '@/app/content/verified-understanding-oath';

/**
 * Renders a level through the SAME component the page uses (the shared certificate
 * oath body), so this asserts the real render path rather than a test-only one.
 */
function renderedTextForLevel(level: MeetingTermsLevel): string {
  const { container } = render(<CertificateOathBody sections={sectionsForLevel(level)} />);
  return (container.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Same flattening applied to a source constant, so the two are comparable. */
function flatten(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Assert a source constant's text is present in rendered output, paragraph by
 * paragraph. A multi-paragraph oath body renders as ADJACENT block spans, so
 * textContent has no separator where the source has `\n\n` — comparing the whole
 * body as one flattened string would fail on the joiner alone while every word
 * was in fact on screen. Checking each paragraph asserts the real property.
 */
function expectRendersText(rendered: string, sourceText: string): void {
  for (const paragraph of sourceText.split('\n\n')) {
    expect(rendered).toContain(flatten(paragraph));
  }
}

describe('P1016 ladder shape', () => {
  it('has three rungs, weakest first, with "Explain back" on top', () => {
    // The ids are content identities, not positions — 2 is the pre-upgrade pledge
    // wherever it sits. Asserting the LABEL order is what actually pins the founder's
    // ordering; asserting the id order alone would pass on a relabelling.
    expect(MEETING_TERMS_LADDER.map((r) => r.label)).toEqual([
      'You may ask',
      'Reveal the gap',
      'Explain back',
    ]);
    expect(MEETING_TERMS_LADDER.map((r) => r.level)).toEqual([1, 3, 2]);
    expect(MEETING_TERMS_LEVELS).toEqual([1, 3, 2]);
  });

  it('gives every rung a label and a trade-off line — including the demanding ones', () => {
    for (const rung of MEETING_TERMS_LADDER) {
      expect(rung.label.length).toBeGreaterThan(0);
      expect(rung.tradeoff.length).toBeGreaterThan(0);
    }
  });

  it('escalates in clause count: 1 grants a right only, 2 and 3 are full oaths', () => {
    // Founder decision: the lowest rung states its weakness by OMISSION, not by a
    // clause that says "none" — an absence given a heading reads as a commitment.
    expect(sectionsForLevel(1).map((s) => s.heading)).toEqual(['YOUR RIGHT']);
    expect(sectionsForLevel(2).length).toBe(3);
    expect(sectionsForLevel(3).length).toBe(3);
  });
});

describe('P1016 level 2 — references the pre-upgrade pledge, does not copy it', () => {
  const source = PLEDGE_VERSIONS[3];

  it('maps to pledge version 3', () => {
    expect(MEETING_TERMS_PLEDGE_SOURCE[2]).toBe(3);
  });

  it('carries the exact YOUR RIGHT / MY PROMISE / THE EXCEPTION text of PLEDGE_VERSIONS[3]', () => {
    const sections = sectionsForLevel(2);
    expect(sections.map((s) => s.text)).toEqual([
      source.yourRight.text,
      source.myPromise.text,
      source.exception.text,
    ]);
    expect(sections.map((s) => s.heading)).toEqual([
      source.yourRight.heading,
      source.myPromise.heading,
      source.exception.heading,
    ]);
  });

  it('RENDERS that text — not just stores it', () => {
    const rendered = renderedTextForLevel(2);
    expectRendersText(rendered, source.yourRight.text);
    expectRendersText(rendered, source.myPromise.text);
    expectRendersText(rendered, source.exception.text);
  });
});

describe('P1016 level 3 — references the current pledge, does not copy it', () => {
  it('maps to CURRENT_PLEDGE_VERSION so it follows the live pledge', () => {
    expect(MEETING_TERMS_PLEDGE_SOURCE[3]).toBe(CURRENT_PLEDGE_VERSION);
  });

  it('carries the exact text of the shared verified-understanding oath', () => {
    // The current pledge's body IS the shared oath constant (pledge-text.tsx v5).
    // Asserting against VERIFIED_UNDERSTANDING_OATH — the deeper source — means a
    // change to the oath that failed to reach this page fails here.
    const oath = VERIFIED_UNDERSTANDING_OATH[5];
    const sections = sectionsForLevel(3);
    expect(sections.map((s) => s.text)).toEqual([
      oath.yourRight.text,
      oath.myPromise.text,
      oath.exception.text,
    ]);
  });

  it('RENDERS that text, including the multi-paragraph promise', () => {
    const oath = VERIFIED_UNDERSTANDING_OATH[5];
    const rendered = renderedTextForLevel(3);
    expectRendersText(rendered, oath.yourRight.text);
    // The promise is three paragraphs — each must survive to the page.
    expect(oath.myPromise.text.split('\n\n')).toHaveLength(3);
    expectRendersText(rendered, oath.myPromise.text);
    expectRendersText(rendered, oath.exception.text);
  });

  it('renders the oath emphasis from the shared boldPhrases, not re-authored markup', () => {
    render(<CertificateOathBody sections={sectionsForLevel(3)} />);
    for (const phrase of VERIFIED_UNDERSTANDING_OATH[5].myPromise.boldPhrases) {
      expect(screen.getByText(phrase)).toHaveClass('font-bold');
    }
  });
});

describe('P1016 the ladder escalates', () => {
  it('every rung renders terms distinct from every other rung', () => {
    const texts = MEETING_TERMS_LEVELS.map((l) =>
      sectionsForLevel(l).map((s) => s.text).join('|'),
    );
    expect(new Set(texts).size).toBe(MEETING_TERMS_LEVELS.length);
  });

  it('level 1 grants the right to ask and makes NO promise — the absence is the point', () => {
    const sections = sectionsForLevel(1);
    expect(sections.find((s) => s.heading === 'YOUR RIGHT')?.text).toMatch(/feel free to ask/i);
    expect(sections.find((s) => s.heading === 'MY PROMISE')).toBeUndefined();
  });

  it('level 1 promises NOTHING back — P1024 removed the reciprocal number', () => {
    // The rung used to end "You may also give me your own number…", which is a promise
    // wearing a right's clothing. P1024 cut it: this rung is a permission to ask and
    // nothing else. Asserting the ABSENCE is what stops the promise creeping back.
    const text = sectionsForLevel(1).find((s) => s.heading === 'YOUR RIGHT')!.text;
    expect(text).not.toMatch(/your own number/i);
    expect(text).not.toMatch(/I will|I'll|I promise/i);
  });
});
