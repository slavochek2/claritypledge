/**
 * @file p1364-back-components.test.tsx
 * @description P1364 §1–§3 — FocusHeader and BottomBackButton take `fallback` and call useGoBack
 * themselves, so a page that renders both gets one behaviour; every §3 page renders both.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { FocusHeader } from '@/app/components/layout/focus-header';
import { BottomBackButton, DEFAULT_BOTTOM_BACK_LABEL } from '@/app/components/layout/bottom-back-button';

function Here() {
  const loc = useLocation();
  return <p data-testid="path">{loc.pathname + loc.search}</p>;
}

function Detail({ fallback }: { fallback: string }) {
  return (
    <>
      <FocusHeader fallback={fallback} />
      <BottomBackButton fallback={fallback} />
      <Here />
    </>
  );
}

function renderAt(entries: string[], fallback = '/feed') {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/detail" element={<Detail fallback={fallback} />} />
        <Route path="*" element={<Here />} />
      </Routes>
    </MemoryRouter>
  );
}

const TOP = { name: 'Go back' };
const BOTTOM = { name: DEFAULT_BOTTOM_BACK_LABEL };
const path = () => screen.getByTestId('path').textContent;

afterEach(() => vi.restoreAllMocks());

describe('P1364 §1 — Back is declared with `fallback`', () => {
  it.each([['top', TOP], ['bottom', BOTTOM]])('%s control returns to the page the reader came from', (_w, name) => {
    renderAt(['/feed?tab=stories', '/detail']);
    fireEvent.click(screen.getByRole('button', name));
    expect(path()).toBe('/feed?tab=stories');
  });

  it.each([['top', TOP], ['bottom', BOTTOM]])('%s control: a cold arrival goes to the fallback, never out of the site', (_w, name) => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    renderAt(['/detail'], '/me');
    fireEvent.click(screen.getByRole('button', name));
    expect(path()).toBe('/me');
  });

  it.each([['top', TOP], ['bottom', BOTTOM]])('%s control: first in the app but not in the tab (an outside page) pops, not the fallback', (_w, name) => {
    vi.spyOn(window.history, 'state', 'get').mockReturnValue({ idx: 0 });
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    renderAt(['/detail'], '/me');
    fireEvent.click(screen.getByRole('button', name));
    // navigate(-1) at the first in-memory entry stays put; the point is it did NOT go to /me.
    expect(path()).toBe('/detail');
  });

  it('the top control reads "Back"; the pill reads "Go back" with a distinct accessible name', () => {
    renderAt(['/a', '/detail']);
    expect(screen.getByRole('button', TOP).textContent).toBe('Back');
    const pill = screen.getByRole('button', BOTTOM);
    expect(pill.textContent).toBe('Go back');
    expect(pill.className).toContain('min-h-11');
  });

  it("the pill's accessible name is a prop (/stake keeps its own)", () => {
    render(
      <MemoryRouter>
        <BottomBackButton fallback="/feed" ariaLabel="Go back from the end of the list" />
      </MemoryRouter>
    );
    expect(screen.getByRole('button', { name: 'Go back from the end of the list' })).toBeTruthy();
  });

  it('`onBack` still works for the allowlisted guarded / in-flow cases', () => {
    const onBack = vi.fn();
    render(
      <MemoryRouter>
        <FocusHeader onBack={onBack} />
        <BottomBackButton onBack={onBack} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', TOP));
    fireEvent.click(screen.getByRole('button', BOTTOM));
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});

/**
 * §3 — the pages that get both controls. Read through the AST: each page must render a
 * BottomBackButton, and its top and bottom controls must declare the SAME action (the same
 * `fallback` expression, or the same guarded `onBack` handler on /story).
 */
const SECTION_3_PAGES = [
  'story-detail-page.tsx',
  'point-detail-page.tsx',
  'video-summary-page.tsx',
  'explain-back-view-page.tsx',
  'agreement-page.tsx',
  'calibration-breakdown-page.tsx',
  'letter-overview-page.tsx',
  'letter-results-page.tsx',
  'stake-page.tsx',
  'transcribe-room-page.tsx',
];

function backActions(file: string, tag: 'FocusHeader' | 'BottomBackButton'): string[] {
  const src = readFileSync(resolve(process.cwd(), 'src/app/pages', file), 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(sf) === tag) {
      for (const p of node.attributes.properties) {
        if (ts.isJsxAttribute(p) && ['fallback', 'onBack'].includes(p.name.getText(sf))) {
          out.push(`${p.name.getText(sf)}=${p.initializer?.getText(sf)}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

describe('P1364 §3 — every detail page has the top Back and the bottom pill, doing the same thing', () => {
  it.each(SECTION_3_PAGES)('%s', (file) => {
    const top = new Set(backActions(file, 'FocusHeader'));
    const bottom = new Set(backActions(file, 'BottomBackButton'));
    expect(top.size, 'a top Back control').toBeGreaterThan(0);
    expect(bottom.size, 'a bottom "Go back" pill').toBeGreaterThan(0);
    expect([...bottom].every(a => top.has(a)), `pill ${[...bottom]} vs top ${[...top]}`).toBe(true);
  });

  it('/story and /point pad the pill clear of the fixed bottom nav', () => {
    for (const file of ['story-detail-page.tsx', 'point-detail-page.tsx']) {
      const src = readFileSync(resolve(process.cwd(), 'src/app/pages', file), 'utf8');
      expect(src).toMatch(/<BottomBackButton[^>]*className=\{CLEAR_BOTTOM_NAV\}/);
    }
  });
});
