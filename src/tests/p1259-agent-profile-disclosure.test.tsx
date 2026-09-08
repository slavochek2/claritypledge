/**
 * @file p1259-agent-profile-disclosure.test.tsx
 * @description P1259 change 2/3 — the disclosure's new home, and the subject's own links.
 *
 * The per-card footer is gone from every story surface; the byline name routes here instead.
 * That makes this component the destination of the ONLY disclosure route in the product, so
 * two properties matter more than anything cosmetic:
 *
 *   1. The one-line summary is VISIBLE ON ARRIVAL, never behind the icon. Spec: "The
 *      disclosure must be visible on arrival, not behind the info icon, for a reader who came
 *      looking for it."
 *   2. The expanded text STANDS ALONE without the "How agent accounts work →" link. `/machines`
 *      is still the P1142 holding page (verified by path — `features/p1142…` sits in
 *      `features/`, not `features/done/`). Spec, Risks: "Do not ship change 2 relying on that
 *      page existing."
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AgentProfileDisclosure } from '@/app/components/shared/agent-profile-disclosure';
import { ProfileSubjectLinks } from '@/app/components/shared/profile-subject-links';

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('P1259 change 2 — the disclosure on the agent profile', () => {
  it('shows the one-line summary without any interaction', () => {
    wrap(<AgentProfileDisclosure name="Agent · Yann LeCun" />);
    const line = screen.getByTestId('agent-disclosure-line').textContent ?? '';
    // FOUNDER DECISION 2026-09-08 — the clause must carry machine-written prose AND real quotes.
    expect(line).toContain('machine-written');
    expect(line).toContain("Yann LeCun's own words");
    expect(line).toContain('linked video');
  });

  it('strips the stored `Agent · ` prefix, like every other surface', () => {
    wrap(<AgentProfileDisclosure name="Agent · Yann LeCun" />);
    expect(screen.getByTestId('agent-disclosure-line').textContent).not.toContain('Agent · Yann LeCun');
  });

  it('keeps the full text behind the information icon until it is asked for', () => {
    wrap(<AgentProfileDisclosure name="Agent · Yann LeCun" />);
    expect(screen.queryByTestId('agent-disclosure-detail')).toBeNull();

    const toggle = screen.getByTestId('agent-disclosure-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);

    expect(screen.getByTestId('agent-disclosure-detail')).toBeTruthy();
    expect(screen.getByTestId('agent-disclosure-toggle').getAttribute('aria-expanded')).toBe('true');
  });

  it('closes again — the toggle is not one-way', () => {
    wrap(<AgentProfileDisclosure name="Agent · Yann LeCun" />);
    fireEvent.click(screen.getByTestId('agent-disclosure-toggle'));
    fireEvent.click(screen.getByTestId('agent-disclosure-toggle'));
    expect(screen.queryByTestId('agent-disclosure-detail')).toBeNull();
  });

  /**
   * THE ONE THAT GUARDS AGAINST SHIPPING INTO A HOLE. If the explainer link were carrying
   * any of the meaning, a reader following it would land on a page that explains nothing.
   * The detail block must name the operator and the machine/quote split by itself.
   */
  it('the expanded text stands alone, without the /machines link carrying any of it', () => {
    wrap(<AgentProfileDisclosure name="Agent · Yann LeCun" />);
    fireEvent.click(screen.getByTestId('agent-disclosure-toggle'));

    const detail = screen.getByTestId('agent-disclosure-detail');
    const link = within(detail).getByTestId('agent-disclosure-link');
    // Remove the link and the remaining prose must still say who wrote this and which parts.
    link.remove();

    const withoutLink = detail.textContent ?? '';
    expect(withoutLink).toContain('ClarityPledge');
    expect(withoutLink).toContain('machine-written');
    expect(withoutLink).toContain('except the quotes');
    expect(withoutLink).toContain('Yann LeCun');
  });

  it('labels the link "agent accounts" while leaving the /machines route alone', () => {
    wrap(<AgentProfileDisclosure name="Agent · Yann LeCun" />);
    fireEvent.click(screen.getByTestId('agent-disclosure-toggle'));
    const link = screen.getByTestId('agent-disclosure-link');
    expect(link.textContent).toBe('How agent accounts work →');
    // Non-Goal: "Do NOT rename the /machines route while changing the link label."
    expect(link.getAttribute('href')).toBe('/machines');
  });
});

describe('P1259 change 3 — the subject\'s own links', () => {
  it('renders one anchor per safe link, opening in a new tab safely', () => {
    wrap(
      <ProfileSubjectLinks
        subjectName="Yann LeCun"
        links={[
          { url: 'https://en.wikipedia.org/wiki/Yann_LeCun', label: 'Wikipedia' },
          { url: 'https://yann.lecun.com' },
        ]}
      />
    );
    const anchors = screen.getAllByTestId('profile-subject-link');
    expect(anchors).toHaveLength(2);
    expect(anchors[0]?.textContent).toContain('Wikipedia');
    expect(anchors[1]?.textContent).toContain('yann.lecun.com');
    for (const a of anchors) {
      expect(a.getAttribute('target')).toBe('_blank');
      // Without noopener the opened page gets a live handle back to this one.
      expect(a.getAttribute('rel') ?? '').toContain('noopener');
      expect(a.getAttribute('rel') ?? '').toContain('noreferrer');
    }
  });

  /** The invariant, at the render edge rather than only in the validator's own unit tests. */
  it('never puts an unsafe scheme into an href', () => {
    wrap(
      <ProfileSubjectLinks
        subjectName="Yann LeCun"
        links={[
          { url: 'javascript:alert(1)', label: 'Wikipedia' },
          { url: 'https://yann.lecun.com' },
        ]}
      />
    );
    const hrefs = screen.getAllByTestId('profile-subject-link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://yann.lecun.com']);
  });

  /** "Social links, none set: the row is absent, not an empty placeholder." */
  it.each([
    ['no links', []],
    ['only unsafe links', [{ url: 'javascript:alert(1)' }]],
    ['a malformed column value', 'not an array'],
    ['undefined', undefined],
  ])('renders nothing at all for %s', (_label, links) => {
    const { container } = wrap(<ProfileSubjectLinks subjectName="Yann LeCun" links={links} />);
    expect(screen.queryByTestId('profile-subject-links')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
