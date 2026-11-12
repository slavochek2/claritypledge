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
} from '@/app/tree/landing-lab/fable/fable-content';

const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, 'utf8');
const h2s = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
const CTA = 'Book a 15-min discovery call';

describe.each([
  ['builders', LandingFable, AGREED_BUILDERS, 'Your team agreed on the strategy.Each of your AIs ships 10x faster.In opposing directions.'],
  ['change managers', LandingFableChange, AGREED_CHANGE, 'Everyone agreed.Then nothing changed.'],
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

  it('labels the example as an illustration in visible text, and names the figure once, by its closing line', () => {
    renderPage();
    const card = screen.getByTestId('agreed-graphic');
    expect(card.tagName).toBe('FIGURE');
    expect(within(card).getByText('Illustration')).toBeVisible();
    // An aria-label repeating the closing line would be announced on top of the figcaption.
    expect(card).not.toHaveAttribute('aria-label');
    expect(card.querySelector('figcaption')?.textContent).toBe(example.punchline);
  });

  it('marks who did it with a tick and who did not with an empty circle', () => {
    renderPage();
    // Two lists in the card: who agreed (named), then the outcomes (introduced by the visible line above it).
    const [agreed, outcomes] = within(screen.getByTestId('agreed-graphic')).getAllByRole('list');
    expect(agreed).toHaveAccessibleName('Who agreed');
    expect(outcomes).not.toHaveAttribute('aria-label');
    const rows = within(outcomes!).getAllByRole('listitem');
    expect(rows).toHaveLength(example.people.length);
    example.people.forEach((p, i) => {
      const ticked = rows[i]!.querySelector('svg') !== null;
      expect(`${p.name}: ${ticked ? 'ticked' : 'empty'}`).toBe(`${p.name}: ${p.outcome === 'stalled' ? 'empty' : 'ticked'}`);
    });
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
      'Reveal a gap, then close it',
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

  it('shows four people who all shipped, none marked as stalled', () => {
    expect(AGREED_BUILDERS.people).toHaveLength(4);
    expect(AGREED_BUILDERS.people.every((p) => p.outcome === 'diverged')).toBe(true);
  });
});

describe('P1667 change managers page: sections', () => {
  it('follows the /change-managers section order with its copy', () => {
    render(<MemoryRouter><LandingFableChange /></MemoryRouter>);
    const order = [
      'Why almost nobody verifies understanding',
      'Reveal a gap, then close it',
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
 * fable-content.ts copies production copy because the production files do not export it. These
 * checks read the production sources, so a later edit there fails here instead of drifting.
 */
describe('P1667 the copied copy is still the production copy', () => {
  // Whitespace is flattened so a record written on one line or over several compares the same.
  const flat = (p: string) => read(p).replace(/\s+/g, ' ');
  const builders = flat('src/app/pages/build-right-thing-landing.tsx');
  const change = flat('src/app/pages/change-managers-page.tsx');
  const norm = flat('src/app/components/landing/team-norm-section.tsx');
  const why = flat('src/app/components/landing/why-nobody-verifies.tsx');
  const missing = (source: string, records: string[]) => records.filter((s) => !source.includes(s));
  // Each record is compared whole, as the production file writes it: the words, the numbers and
  // which citation they point at. Comparing the words alone would miss a changed number.
  const reference = (r: { n: number; label: string; url: string }) => `n: ${r.n}, label: "${r.label}", url: "${r.url}"`;

  it('control: a changed number or a reworded line is reported', () => {
    const stat = ASSUMED_STATS[0]!;
    expect(missing(builders, [`value: ${stat.value + 1}, denom: ${stat.denom}, label: "${stat.label}", ref: ${stat.ref}`])).toHaveLength(1);
    expect(missing(builders, ['Tap a song’s rhythm, reworded'])).toHaveLength(1);
    expect(missing(change, [reference({ ...CHANGE_REFERENCES[0]!, n: 2 })])).toHaveLength(1);
  });

  it('builders: references, stats and reasons, with their numbers and citations', () => {
    expect(missing(builders, REFERENCES.map(reference))).toEqual([]);
    expect(missing(builders, ASSUMED_STATS.map((s) => `value: ${s.value}, denom: ${s.denom}, label: "${s.label}", ref: ${s.ref}`))).toEqual([]);
    expect(missing(builders, REASONS_NOBODY_CHECKS.map((r) => `title: "${r.title}", text: "${r.text}", ref: ${r.refs[0]}${r.refs[1] ? `, ref2: ${r.refs[1]}` : ''} }`))).toEqual([]);
    expect(REFERENCES).toHaveLength(7);
    expect(ASSUMED_STATS).toHaveLength(3);
    expect(REASONS_NOBODY_CHECKS).toHaveLength(3);
  });

  it('change managers: references and reasons, with their citations', () => {
    expect(missing(change, CHANGE_REFERENCES.map(reference))).toEqual([]);
    // Each reason is compared with the source it cites in production. Hierarchy's text is passed
    // in by the page (the imported constant), so only its title and source are literals there.
    const [hierarchy, transparency, curse] = CHANGE_REASONS;
    expect(missing(why, [
      `title: "${hierarchy!.title}", text: hierarchyText, source: "ha" as const`,
      `title: "${transparency!.title}", text: "${transparency!.text}", source: "newton" as const`,
      `title: "${curse!.title}", text: "${curse!.text}", source: "camerer" as const`,
    ])).toEqual([]);
    // The page maps newton and camerer to references 2 and 3, and gives hierarchy ("ha") none.
    expect(change).toContain('{ newton: 2, camerer: 3 }');
    expect(CHANGE_REASONS.map((r) => r.refs)).toEqual([[], [2], [3]]);
    expect(CHANGE_REFERENCES).toHaveLength(3);
  });

  it.each([
    ['builders', 'src/app/tree/landing-lab/fable/LandingFable.tsx', 'src/app/pages/build-right-thing-landing.tsx', [
      'Prevent rework before work begins', 'Get your team off the treadmill.', 'failed startups built something the market never wanted.',
    ]],
    ['change managers', 'src/app/tree/landing-lab/fable/LandingFableChange.tsx', 'src/app/pages/change-managers-page.tsx', [
      'For change managers', 'AI rollouts, new processes, reorganisations. People say yes in the meeting and mean different things.',
      'of change projects missed at least one objective or failed entirely. The top obstacle was changing mindsets and attitudes, not technology.',
      'Reveal gaps in understanding',
    ]],
  ] as const)('%s: the hero lines, the stat sentence and the whole chat story', (_name, prototypePath, productionPath, lines) => {
    const prototype = read(prototypePath);
    const production = flat(productionPath);
    // Every prop of the chat story, taken from the prototype's own source so a new prop is covered too.
    const chatProps = [...prototype.matchAll(/^\s+((?:variant|heading|contact|subtitle|received|honest|sent|consequence|thoughtTitle|thoughtBody)=.+)$/gm)].map((m) => m[1]!.trim());
    expect(chatProps.length, 'the chat props were parsed').toBe(10);
    expect(missing(production, chatProps)).toEqual([]);
    expect(missing(production, [...lines])).toEqual([]);
    expect(missing(flat(prototypePath), [...lines])).toEqual([]);
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

  it('leaves the production pages on their own sections', () => {
    expect(read('src/app/pages/build-right-thing-landing.tsx')).toContain('<HowPlatformWorks />');
    const change = read('src/app/pages/change-managers-page.tsx');
    expect(change).toContain('<TeamNormSection');
    expect(change).not.toContain('landing-lab');
    expect(read('src/app/pages/build-right-thing-landing.tsx')).not.toContain('landing-lab');
  });
});
