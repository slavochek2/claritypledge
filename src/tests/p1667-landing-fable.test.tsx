/**
 * P1667 — the two /tree/landing-fable* explorations: the labelled hero example, the phone-first
 * hero structure, the sections each page renders, and the dev-only route contract.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';

vi.mock('@sentry/react', () => ({ captureException: vi.fn() }));
vi.mock('@/lib/mixpanel', () => ({ analytics: { track: vi.fn() } }));
vi.mock('@/app/components/landing/social-proof', () => ({
  PledgerAvatarStack: () => <div data-testid="pledgers" />,
  ScrollIndicator: ({ label, targetId, className }: { label: string; targetId: string; className?: string }) => (
    <button type="button" data-target={targetId} className={className}>{label}</button>
  ),
}));
vi.mock('@/app/components/landing/founder-credibility', () => ({ FounderCredibility: () => <section data-testid="founder"><h2>Paid for the lesson</h2></section> }));
// A span, not a <meta>: React hoists <meta> into <head>, out of the rendered container.
vi.mock('@/app/components/seo', () => ({ SEO: ({ noIndex }: { noIndex?: boolean }) => <span hidden data-testid="seo" data-noindex={String(!!noIndex)} /> }));

import { LandingFable } from '@/app/tree/landing-lab/fable/LandingFable';
import { LandingFableChange } from '@/app/tree/landing-lab/fable/LandingFableChange';
import {
  AGREED_BUILDERS, AGREED_CHANGE, ASSUMED_STATS, CHANGE_REASONS, CHANGE_REFERENCES, NORM_PATH, REASONS_NOBODY_CHECKS, REFERENCES,
} from '@/app/components/landing/fable/fable-content';

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, 'utf8');
const h2s = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
const CTA = 'Book a 15-min discovery call';

describe.each([
  ['builders', LandingFable, AGREED_BUILDERS, 'Your team agreed on the strategy. Each of your AIs ships 10x faster. In opposing directions.'],
  // P1671: a space between the two lines, so the heading reads as two sentences (the live page's text).
  ['change managers', LandingFableChange, AGREED_CHANGE, 'Everyone agreed. Then nothing changed.'],
] as const)('P1667 %s page: hero', (_name, Page, example, h1) => {
  const renderPage = () => render(<MemoryRouter><Page /></MemoryRouter>);

  it('keeps the production headline', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(h1);
  });

  it('shows the example as readable text: the sentence, the yes count, every outcome, the punchline', () => {
    renderPage();
    const card = screen.getByTestId('agreed-graphic');
    expect(within(card).getByText(`“${example.said}”`)).toBeInTheDocument();
    expect(within(card).getByText(example.agreed)).toBeInTheDocument();
    expect(within(card).getByText(example.later)).toBeInTheDocument();
    expect(within(card).getByText(example.punchline)).toBeInTheDocument();
    const rows = within(card).getAllByRole('listitem').map((li) => li.textContent);
    for (const p of example.people) {
      expect(rows).toContain(p.name); // the yes chip
      expect(rows).toContain(`${p.name} ${p.did}`); // what that person then did
    }
  });

  // P1670 dropped the "Illustration" marker (founder: it read as odd on a drawing).
  it('names the figure once, by its closing line, and carries no "Illustration" marker', () => {
    renderPage();
    const card = screen.getByTestId('agreed-graphic');
    expect(card.tagName).toBe('FIGURE');
    expect(card.textContent).not.toContain('Illustration');
    // An aria-label repeating the closing line would be announced on top of the figcaption.
    expect(card).not.toHaveAttribute('aria-label');
    expect(card.querySelector('figcaption')?.textContent).toBe(example.punchline);
  });

  // P1670 replaced the tick / empty-circle rows with a drawn figure per person. The two lists stay
  // for screen readers; what each person did is now carried by the figure's outcome.
  it('keeps both lists for screen readers and draws one figure per person, marked with that person\'s outcome', () => {
    renderPage();
    const card = screen.getByTestId('agreed-graphic');
    // Two lists in the card: who agreed (named), then the outcomes (introduced by the line above it).
    const [agreed, outcomes] = within(card).getAllByRole('list');
    expect(agreed).toHaveAccessibleName('Who agreed');
    expect(outcomes).not.toHaveAttribute('aria-label');
    expect(within(outcomes!).getAllByRole('listitem')).toHaveLength(example.people.length);
    const figures = [...card.querySelectorAll<SVGGElement>('[data-figure]')];
    expect(figures.map((f) => `${f.dataset.figure}: ${f.dataset.outcome}`)).toEqual(example.people.map((p) => `${p.name}: ${p.outcome}`));
  });

  it('phone first screen ends at a cue that points at the example block, which holds the card', () => {
    renderPage();
    const cue = screen.getByRole('button', { name: 'See an example' });
    expect(cue.className).toContain('lg:hidden');
    const target = document.getElementById(cue.dataset.target!);
    expect(target).toContainElement(screen.getByTestId('agreed-graphic'));
    // The text column fills the first screen below `lg`, so the example starts on the second one.
    const column = cue.parentElement!;
    expect(column.className).toContain('min-h-[calc(100svh-4rem)]');
    expect(column).not.toContainElement(target);
  });

  it('has one action, shown in the hero and the closing band, and is noindex', () => {
    renderPage();
    const ctas = screen.getAllByRole('link', { name: CTA });
    expect(ctas).toHaveLength(2);
    for (const a of ctas) expect(a).toHaveAttribute('href', '/intro');
    expect(screen.getByTestId('seo').dataset.noindex).toBe('true');
    expect(document.getElementById('references')).not.toBeNull();
  });
});

describe('P1667 builders page: sections', () => {
  it('replaces "How the platform works" with the gap exchange and the team-norm path', () => {
    render(<MemoryRouter><LandingFable /></MemoryRouter>);
    const order = [
      'Everybody assumes they understand',
      'Why almost nobody verifies understanding',
      'The illusion of shared understanding',
      'Reveal a gap in understanding, then bridge it',
      'Make it normal to admit “I don’t understand”',
      'How revealing gaps becomes a team norm',
      'Paid for the lesson',
      'Stop fighting the wrong disagreement.Start revealing hidden misunderstandings.',
    ];
    expect(h2s().filter((t) => order.includes(t!))).toEqual(order);
    expect(screen.queryByText(/How the platform works/i)).toBeNull();
    expect(screen.queryByText(/Agents flag/i)).toBeNull();
    for (const step of ['See the cost', 'Find champions', 'Spread', 'Norm', 'Maintain']) expect(screen.getByText(step)).toBeInTheDocument();
    expect(screen.getByText('failed startups built something the market never wanted.', { exact: false })).toBeInTheDocument();
  });

  // P1671: five people on both pictures (founder, 2026-11-12); was four.
  it('shows five people who all shipped, none marked as stalled', () => {
    expect(AGREED_BUILDERS.people).toHaveLength(5);
    expect(AGREED_BUILDERS.people.every((p) => p.outcome === 'diverged')).toBe(true);
  });
});

describe('P1667 change managers page: sections', () => {
  it('follows the /change-managers section order with its copy', () => {
    render(<MemoryRouter><LandingFableChange /></MemoryRouter>);
    const order = [
      'Why almost nobody verifies understanding',
      'Reveal a gap in understanding, then bridge it',
      'Make it normal to ask how well we understand each other',
      'How revealing gaps becomes a team norm',
      'Paid for the lesson',
      'Reveal gaps in understanding before your rollout stalls',
    ];
    expect(h2s().filter((t) => order.includes(t!))).toEqual(order);
    expect(screen.getByText('For change managers')).toBeInTheDocument();
    expect(screen.getByText('AI rollouts, new processes, reorganisations. People say yes in the meeting and mean different things.')).toBeInTheDocument();
    expect(screen.getByText('Sounds good 👍')).toBeInTheDocument();
    for (const r of ['Hierarchy', 'Illusion of transparency', 'Curse of knowledge']) expect(screen.getByRole('heading', { level: 3, name: r })).toBeInTheDocument();
    expect(screen.getByLabelText('Clarity Group Terms')).toBeInTheDocument();
  });

  it('keeps the stat in IBM\'s own words', () => {
    render(<MemoryRouter><LandingFableChange /></MemoryRouter>);
    const stakes = document.getElementById('stakes')!;
    expect(stakes.textContent).toContain('59%');
    expect(stakes.textContent).toContain('of change projects missed at least one objective or failed entirely. The top obstacle was changing mindsets and attitudes, not technology.');
  });

  it('shows five people of whom exactly one changed', () => {
    expect(AGREED_CHANGE.people).toHaveLength(5);
    expect(AGREED_CHANGE.people.filter((p) => p.outcome === 'changed').map((p) => p.name)).toEqual(['Kim']);
    expect(AGREED_CHANGE.people.filter((p) => p.outcome === 'stalled')).toHaveLength(4);
  });
});

/**
 * Since P1671 the live /builders and /change-managers render the fable layout, so the page copy has
 * one home (fable-content.ts) and the old prototype-vs-production copy checks have nothing to
 * compare. What is still copied is the wording of the shared sections other use-case pages render;
 * these checks read those sources, so an edit there fails here instead of drifting.
 */
describe('P1667 the copied copy is still the shared sections\' copy', () => {
  // Whitespace is flattened so a record written on one line or over several compares the same.
  const flat = (p: string) => read(p).replace(/\s+/g, ' ');
  const norm = flat('src/app/components/landing/team-norm-section.tsx');
  const why = flat('src/app/components/landing/why-nobody-verifies.tsx');
  const missing = (source: string, records: string[]) => records.filter((s) => !source.includes(s));

  it('control: a reworded line is reported', () => {
    const [, transparency] = CHANGE_REASONS;
    expect(missing(why, [`title: "${transparency!.title}", text: "${transparency!.text} reworded", source: "newton" as const`])).toHaveLength(1);
  });

  it('change managers: the reasons, as the shared section words them', () => {
    // Hierarchy's title and text are props there (/communities overrides them), so the default title is the literal to match.
    const [hierarchy, transparency, curse] = CHANGE_REASONS;
    expect(missing(why, [
      `hierarchyTitle = "${hierarchy!.title}",`,
      'title: hierarchyTitle, text: hierarchyText, source: "ha" as const',
      `title: "${transparency!.title}", text: "${transparency!.text}", source: "newton" as const`,
      `title: "${curse!.title}", text: "${curse!.text}", source: "camerer" as const`,
    ])).toEqual([]);
    // Newton and Camerer are references 2 and 3; hierarchy carries none.
    expect(CHANGE_REASONS.map((r) => r.refs)).toEqual([[], [2], [3]]);
    expect(CHANGE_REFERENCES).toHaveLength(3);
    expect(REFERENCES).toHaveLength(7);
    expect(ASSUMED_STATS).toHaveLength(3);
    expect(REASONS_NOBODY_CHECKS).toHaveLength(3);
  });

  it('the five-step norm path, with who has picked it up at each step', () => {
    const strip = (s: { blue: number[]; questions?: number[]; plus?: boolean }) =>
      `strip: { blue: [${s.blue.join(', ')}]${s.questions ? `, questions: [${s.questions.join(', ')}]` : ''}${s.plus ? ', plus: true' : ''} }`;
    const steps = NORM_PATH.map((p) => `title: "${p.title}", text: ${p.title === 'Maintain' ? 'maintainText' : `"${p.text}"`}, ${strip(p.strip)}`);
    expect(missing(norm, steps)).toEqual([]);
    expect(NORM_PATH.map((p) => p.title)).toEqual(['See the cost', 'Find champions', 'Spread', 'Norm', 'Maintain']);
  });
});

describe('P1667 routes and production pages', () => {
  const routes = read('src/app/tree/tree-routes.tsx');

  it('registers both pages DEV-guarded on the same line, inside the public layout', () => {
    for (const path of ['/tree/landing-fable', '/tree/landing-fable-change']) {
      const line = routes.split('\n').find((l) => l.includes(`path="${path}"`));
      expect(line, `route line for ${path}`).toBeDefined();
      expect(line).toMatch(/^\s*\{import\.meta\.env\.DEV && <Route /);
      expect(line).toContain('<ClarityLandingLayout surface="public">');
    }
  });

  // P1671 reversed this: the production pages render the fable layout, never a /tree module.
  it('the production pages render the fable layout, and import nothing from /tree', () => {
    const builders = read('src/app/pages/build-right-thing-landing.tsx');
    const change = read('src/app/pages/change-managers-page.tsx');
    expect(builders).toContain('<BuildersFable');
    expect(builders).not.toContain('<HowPlatformWorks');
    expect(change).toContain('<ChangeFable');
    expect(change).not.toContain('<TeamNormSection');
    for (const page of [builders, change]) expect(page).not.toContain('app/tree/');
  });
});
