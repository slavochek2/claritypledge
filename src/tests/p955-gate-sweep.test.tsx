/**
 * P955 gate 7c (P1536 S6.4): rule 9's typing assertion over EVERY `/tree/_gate/*` fixture phase that renders a composer, not only the two canvas fixtures
 * p955-gate.test.ts names. The fixtures and their phases are DERIVED (import.meta.glob over the fixture folders, the phase list read from each fixture's own
 * nav links), so a fixture or phase added later is swept without an edit here; only the two members known to carry a composer are asserted by name, so a
 * derivation that found nothing, or skipped one kind, cannot pass green.
 */
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { useState, type ComponentType } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { assertStableVariantsOnInput } from './p955-stable-variants';

type FixtureModule = { GateFixture?: ComponentType; default?: ComponentType };
const FIXTURES = import.meta.glob<FixtureModule>('/src/app/tree/_gate/*/GateFixture.tsx', { eager: true });
const nameOf = (path: string) => path.split('/').slice(-2, -1)[0]!;

const mount = (Fixture: ComponentType, name: string, phase: string | null) => {
  localStorage.clear();
  const url = `/tree/_gate/${name}${phase ? `?phase=${phase}` : ''}`;
  window.history.replaceState(null, '', url); // a fixture that reads window.location (terms-update) sees the same phase
  return render(<MemoryRouter initialEntries={[url]}><Fixture /></MemoryRouter>);
};
const phasesOf = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('nav a')).map((a) => new URL(a.getAttribute('href') ?? '', 'http://x').searchParams.get('phase')).filter((p): p is string => !!p);

/** Types into a phase's composer and returns what the rule says; the phase may open with text typed in (it is cleared first, the assertion starts from an empty field). */
function sweepComposer(container: HTMLElement): string | null {
  const composer = within(container).queryByTestId('composer');
  if (!composer) return 'no composer';
  const field = composer.querySelector<HTMLTextAreaElement>('textarea');
  if (field && field.value !== '') fireEvent.change(field, { target: { value: '' } });
  try {
    assertStableVariantsOnInput(container, composer);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

interface Result { fixture: string; phase: string | null; verdict: string | null }
const sweep = (): Result[] => {
  const out: Result[] = [];
  for (const [path, mod] of Object.entries(FIXTURES)) {
    const Fixture = mod.GateFixture ?? mod.default;
    if (!Fixture) throw new Error(`${path} exports no GateFixture`);
    const name = nameOf(path);
    const first = mount(Fixture, name, null);
    const phases: Array<string | null> = phasesOf(first.container).length ? phasesOf(first.container) : [null];
    first.unmount();
    for (const phase of phases) {
      const view = mount(Fixture, name, phase);
      out.push({ fixture: name, phase, verdict: sweepComposer(view.container) });
      view.unmount();
      cleanup();
    }
  }
  return out;
};

describe('P955 gate 7c: rule 9 over every /tree/_gate/* phase that renders a composer', () => {
  afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

  it('derives every fixture and phase, finds the composer fixtures, and every phase with a composer keeps every button but the send slot unchanged while typing', () => {
    const results = sweep();
    const withComposer = results.filter((r) => r.verdict !== 'no composer');
    // Known members, one per derivation path: a fixture folder found by the glob, a phase list read from a nav, a phase reached with no nav at all.
    expect(Object.keys(FIXTURES).map(nameOf)).toEqual(expect.arrayContaining(['canvas-thread', 'canvas-workspace', 'canvas-draft', 'example', 'terms-update']));
    expect(new Set(withComposer.map((r) => r.fixture))).toEqual(new Set(['canvas-thread', 'canvas-workspace']));
    expect(results.some((r) => r.fixture === 'terms-update' && r.phase === null)).toBe(true);
    expect(withComposer.length).toBeGreaterThanOrEqual(13);
    // the verdicts, as "fixture phase: message" so a failure names the phase
    expect(withComposer.filter((r) => r.verdict !== null).map((r) => `${r.fixture} ${r.phase}: ${r.verdict}`)).toEqual([]);
  });

  it('CONTROL (a fixture outside the real ones): the same sweep path reports a composer phase whose button changes look while typing', () => {
    function Bad() {
      const [text, setText] = useState('');
      return (
        <div>
          <button type="button" className={text ? 'bg-blue-600 text-white' : 'border'}>Copy prompt</button>
          <div data-testid="composer">
            <textarea aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} />
            {text ? <button type="submit" data-composer-send="">Send</button> : <button type="button" data-composer-send="">Voice note</button>}
          </div>
        </div>
      );
    }
    const view = render(<Bad />);
    expect(sweepComposer(view.container)).toMatch(/Copy prompt: look/);
  });
});
