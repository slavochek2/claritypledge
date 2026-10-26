import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ deleteDoc: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/app/data/docs-service', () => ({ docsService: { deleteDoc: mocks.deleteDoc } }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));

import { DocDeleteDraft } from './doc-delete-draft';

function Where() {
  const l = useLocation();
  return <div data-testid="where">{l.pathname + l.search}</div>;
}

function renderIt(hasSent = false) {
  return render(
    <MemoryRouter initialEntries={['/letters/drafts/d1']}>
      <Routes>
        <Route path="/letters/drafts/:id" element={<DocDeleteDraft docId="d1" title="Draft about trust" hasSentLetters={hasSent} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('DocDeleteDraft (moved in from the Artifacts row menu)', () => {
  it('is a low-weight red text button, never a blue primary', () => {
    renderIt();
    const btn = screen.getByRole('button', { name: 'Delete draft' });
    expect(btn.className).toContain('text-destructive');
    expect(btn.className).not.toMatch(/(^|\s)bg-(primary|blue-\d00|destructive)(\s|$)/); // a filled button; hover tints are fine
    expect(btn.className).toMatch(/\bmin-h-10\b/);
    expect(btn).toBeEnabled();
  });

  it('asks first, deletes only on confirm, then goes to the Drafts list', async () => {
    const user = userEvent.setup();
    mocks.deleteDoc.mockResolvedValue(undefined);
    renderIt();
    await user.click(screen.getByRole('button', { name: 'Delete draft' }));
    expect(await screen.findByText('Are you sure you want to delete “Draft about trust”? This cannot be undone.')).toBeInTheDocument();
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.deleteDoc).toHaveBeenCalledWith('d1'));
    expect(mocks.success).toHaveBeenCalledWith('Draft deleted');
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/artifacts?tab=letters&list=drafts'));
  });

  it('cancelled: nothing is deleted and the page stays', async () => {
    const user = userEvent.setup();
    renderIt();
    await user.click(screen.getByRole('button', { name: 'Delete draft' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('once letters were sent from the draft it is disabled and says why (today\'s guard)', () => {
    renderIt(true);
    expect(screen.getByRole('button', { name: 'Delete draft' })).toBeDisabled();
    expect(screen.getByText("Can't delete — letters were sent from this draft.")).toBeInTheDocument();
  });

  it('the server refusing (letters sent meanwhile) keeps the page and says why', async () => {
    const user = userEvent.setup();
    mocks.deleteDoc.mockRejectedValue(new Error('SEALED_LETTERS_EXIST'));
    renderIt();
    await user.click(screen.getByRole('button', { name: 'Delete draft' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Can't delete — letters were sent from this draft."));
    expect(screen.queryByTestId('where')).toBeNull();
  });

  it('any other failure says the draft could not be deleted and stays', async () => {
    const user = userEvent.setup();
    mocks.deleteDoc.mockRejectedValue(new Error('boom'));
    renderIt();
    await user.click(screen.getByRole('button', { name: 'Delete draft' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Couldn't delete draft."));
    expect(screen.queryByTestId('where')).toBeNull();
  });
});
