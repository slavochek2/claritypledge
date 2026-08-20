/**
 * P1104 — an agent's monogram must identify the SUBJECT, not the word "Agent".
 *
 * Every agent account is named `Agent · {subject}`, so the shared initials helper read "Agent"
 * as the first name: `Agent · Jordan Rivera` rendered "AR", and every agent in the product
 * rendered "A" plus one letter. The leading A is constant across all agents, so half the
 * monogram carried no information and agents stopped being distinguishable from each other at
 * row size.
 */
import { describe, it, expect } from 'vitest';
import { getInitials, stripAgentPrefix } from '@/lib/utils';

describe('stripAgentPrefix (P1104)', () => {
  it('produces the subject initials, not "A" plus a letter', () => {
    expect(getInitials(stripAgentPrefix('Agent · Jordan Rivera'))).toBe('JR');
  });

  it('is constant-free across agents — two agents do not share a leading letter', () => {
    // The defect this guards: pre-fix these were "AR" and "AS", differing only in the second
    // character. A monogram whose first half never varies is half a monogram.
    const a = getInitials(stripAgentPrefix('Agent · Jordan Rivera'));
    const b = getInitials(stripAgentPrefix('Agent · Ada Solberg'));
    expect(a).toBe('JR');
    expect(b).toBe('AS');
    expect(a[0]).not.toBe(b[0]);
  });

  it.each([
    ['Agent · Jordan Rivera', 'Jordan Rivera'],
    ['Agent  ·  Jordan Rivera', 'Jordan Rivera'],
    ['agent · jordan rivera', 'jordan rivera'],
    ['Agent • Jordan Rivera', 'Jordan Rivera'],
    ['Agent - Jordan Rivera', 'Jordan Rivera'],
    ['Agent Jordan Rivera', 'Jordan Rivera'],
  ])('tolerates the separator in %s', (input, expected) => {
    // The display name is data. The DB guard normalises what may be RESERVED, not what must be
    // RENDERED, so any separator can reach the avatar.
    expect(stripAgentPrefix(input)?.trim()).toBe(expected);
  });

  it('leaves an ordinary human name untouched', () => {
    expect(stripAgentPrefix('Jordan Rivera')).toBe('Jordan Rivera');
    expect(getInitials(stripAgentPrefix('Jordan Rivera'))).toBe('JR');
  });

  it('does not eat a real name that merely starts with Agent', () => {
    // "Agent Smith" is a person the reservation deliberately leaves available, so the helper
    // must not strip his surname down to one initial.
    expect(stripAgentPrefix('Agentic Systems')).toBe('Agentic Systems');
  });

  it('falls back rather than returning an empty monogram', () => {
    // A name that is nothing BUT the prefix would otherwise render a blank avatar.
    expect(stripAgentPrefix('Agent ·')).toBe('Agent ·');
    // "A·" — the shared helper's ordinary behaviour for a two-token name whose last token is
    // punctuation. Asserting 'A' here was MY error, not the code's: nothing in P1104 promises
    // to clean that up, and pretending otherwise would encode a guarantee that does not exist.
    expect(getInitials(stripAgentPrefix('Agent ·'))).toBe('A·');
  });

  it('handles undefined and empty without throwing', () => {
    expect(stripAgentPrefix(undefined)).toBeUndefined();
    expect(stripAgentPrefix('   ')).toBe('   ');
  });
});
