import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { LettersRedirect, DocsRedirect } from '@/app/pages/artifacts/legacy-redirects';
import { legacyLettersTarget } from '@/app/pages/artifacts/legacy-redirect-targets';

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/letters" element={<LettersRedirect />} />
        <Route path="/docs" element={<DocsRedirect />} />
        <Route path="/letters/drafts/:docId" element={<div data-testid="draft-page" />} />
        <Route path="/artifacts" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('P1545 legacy Letters URLs land in the Artifacts page', () => {
  it.each([
    ['/letters', '/artifacts'],
    ['/letters?tab=drafts', '/artifacts?tab=yours&type=letters'],
    ['/letters?tab=sent', '/artifacts?tab=yours&type=letters'],
    ['/letters?tab=inbox', '/artifacts?tab=shared'],
    ['/letters?tab=nonsense', '/artifacts'],
    ['/docs', '/artifacts?tab=yours&type=letters'],
  ])('%s -> %s', (from, to) => {
    renderAt(from);
    expect(screen.getByTestId('where').textContent).toBe(to);
  });

  it('keeps /letters/drafts/:docId as a real page', () => {
    renderAt('/letters/drafts/doc-1');
    expect(screen.getByTestId('draft-page')).toBeInTheDocument();
  });

  it('maps pure strings', () => {
    expect(legacyLettersTarget('?tab=inbox')).toBe('/artifacts?tab=shared');
    expect(legacyLettersTarget('')).toBe('/artifacts');
  });
});
