// @vitest-environment jsdom
/**
 * P1337 — the compare page: rows sorted by gap, opened in a new tab, tag chips driving ?tag,
 * and the one-line states (signed out, own profile, nothing shared).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ComparePage, StatementRow } from '@/app/pages/compare-page';
import * as auth from '@/auth';
import * as api from '@/app/data/api';
import * as compare from '@/app/data/compare-service';

vi.mock('@/auth');
vi.mock('@/app/data/api', () => ({ getProfileBySlug: vi.fn() }));
vi.mock('@/app/data/compare-service', () => ({
  getTagStatements: vi.fn(),
  getPositionsFor: vi.fn(),
  getSharedTags: vi.fn(),
}));

const VIEWER = 'viewer-1';
const OTHER = 'other-1';

function signInAs(id: string | null) {
  vi.mocked(auth.useAuth).mockReturnValue({
    user: id ? ({ id, name: 'Viewer Person', hasPledged: false } as any) : null,
    session: null,
    isLoading: false,
    sessionChecked: true,
    signOut: vi.fn(),
    refreshProfile: vi.fn(),
  });
}

function LocationProbe() {
  const { pathname, search } = useLocation();
  return <div data-testid="loc">{pathname + search}</div>;
}

function renderAt(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/compare/:slug" element={<><ComparePage /><LocationProbe /></>} />
        <Route path="/p/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ComparePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInAs(VIEWER);
    vi.mocked(api.getProfileBySlug).mockResolvedValue({
      id: OTHER, slug: 'ben-tan', name: 'Ben Tan', hasPledged: true,
    } as any);
    vi.mocked(compare.getSharedTags).mockResolvedValue([
      { tag: 'ikigai1', count: 3 },
      { tag: 'understanding', count: 1 },
    ]);
    vi.mocked(compare.getTagStatements).mockResolvedValue([
      { id: 'p-same', statement: 'We agree on this' },
      { id: 'p-far', statement: 'We disagree on this' },
    ]);
    vi.mocked(compare.getPositionsFor).mockResolvedValue(
      new Map([
        [VIEWER, new Map([['p-same', 'agree'], ['p-far', 'strongly_agree']])],
        [OTHER, new Map([['p-same', 'agree'], ['p-far', 'strongly_disagree']])],
      ]) as any,
    );
  });

  it('lists the furthest-apart statement first, agreements last, each opening in a new tab', async () => {
    renderAt('/compare/ben-tan');

    const far = await screen.findByText('We disagree on this');
    const same = screen.getByText('We agree on this');
    expect(far.compareDocumentPosition(same) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const link = far.closest('a')!;
    expect(link).toHaveAttribute('href', '/point/p-far');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));

    expect(screen.getByText('Strongly agree')).toBeInTheDocument(); // viewer, first person
    expect(screen.getByText('Strongly disagrees')).toBeInTheDocument(); // other, third person
    expect(screen.getByRole('heading', { name: 'You and Ben' })).toBeInTheDocument();
    // default tag = the top shared tag
    expect(compare.getTagStatements).toHaveBeenCalledWith('ikigai1');
  });

  it('a chip rewrites ?tag in place and reloads the rows for that tag', async () => {
    renderAt('/compare/ben-tan');
    await screen.findByText('We disagree on this');

    fireEvent.click(screen.getByRole('button', { name: '#understanding' }));

    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/compare/ben-tan?tag=understanding'));
    await waitFor(() => expect(compare.getTagStatements).toHaveBeenCalledWith('understanding'));
  });

  it('keeps an unshared ?tag in the chip list and says so in one line', async () => {
    vi.mocked(compare.getTagStatements).mockResolvedValue([]);
    vi.mocked(compare.getPositionsFor).mockResolvedValue(new Map());

    renderAt('/compare/ben-tan?tag=cmp7');

    expect(await screen.findByText('Nothing on #cmp7 you both answered.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '#cmp7' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('says there is nothing yet when no tag is shared', async () => {
    vi.mocked(compare.getSharedTags).mockResolvedValue([]);

    renderAt('/compare/ben-tan');

    expect(await screen.findByText('No statements you both hold a position on yet.')).toBeInTheDocument();
    expect(compare.getTagStatements).not.toHaveBeenCalled();
  });

  it('asks a signed-out visitor to sign in, carrying the page as the redirect', () => {
    signInAs(null);

    renderAt('/compare/ben-tan?tag=ikigai1');

    const link = screen.getByRole('link', { name: 'Sign in to compare' });
    expect(link).toHaveAttribute('href', `/login?redirect=${encodeURIComponent('/compare/ben-tan?tag=ikigai1')}`);
    expect(api.getProfileBySlug).not.toHaveBeenCalled();
  });

  it('sends the viewer to their own profile instead of comparing them with themselves', async () => {
    vi.mocked(api.getProfileBySlug).mockResolvedValue({
      id: VIEWER, slug: 'viewer-person', name: 'Viewer Person', hasPledged: false,
    } as any);

    renderAt('/compare/viewer-person');

    await waitFor(() => expect(screen.getByTestId('loc')).toHaveTextContent('/p/viewer-person'));
    expect(compare.getSharedTags).not.toHaveBeenCalled();
  });
});

describe('StatementRow trailing slot', () => {
  it('renders trailing content outside the link, so interacting with it cannot open the point', () => {
    const person = { name: 'A', hasPledged: false };
    render(
      <ul>
        <StatementRow
          row={{ pointId: 'p1', statement: 'S', mine: 'agree', theirs: 'disagree', gap: 4 }}
          me={person}
          them={person}
          trailing={<button type="button">Talk about this</button>}
        />
      </ul>,
    );

    const button = screen.getByRole('button', { name: 'Talk about this' });
    expect(button.closest('a')).toBeNull();
    expect(screen.getByText('S').closest('a')).toHaveAttribute('target', '_blank');
  });
});
