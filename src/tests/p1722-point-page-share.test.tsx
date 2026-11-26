/** P1722 AC: the point page shows Share for a public point (and keeps hiding it for a private point published to a chat). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const shared = vi.hoisted(() => vi.fn());
vi.mock('@/app/data/clarify-service', async () => ({ ...(await vi.importActual<object>('@/app/data/clarify-service')), isPointChatShared: shared }));

import { PointDetailFooter } from '@/app/pages/PointDetailFooter';

afterEach(cleanup);
const mount = (visibility: string) => render(
  <MemoryRouter><PointDetailFooter point={{ id: 'p1', statement: 'A public point', visibility }} signedIn hasOwnStory /></MemoryRouter>,
);

describe('point page Share', () => {
  it('a public point shows Share, with no chat lookup', () => {
    mount('public');
    expect(screen.getByRole('button', { name: 'Share point' })).toBeInTheDocument();
    expect(shared).not.toHaveBeenCalled();
  });
  it('CONTROL: a private point published to a chat shows no Share', async () => {
    shared.mockResolvedValue(true);
    mount('private');
    await waitFor(() => expect(shared).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Share point' })).toBeNull();
  });
});
