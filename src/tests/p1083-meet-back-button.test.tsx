/**
 * @file p1083-meet-back-button.test.tsx
 * @description Done-When coverage for P1083's conditional back button on /meet:
 * visible only when navigation arrived from /ready (via route state), never
 * otherwise, and returns to /ready when tapped.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@/lib/mixpanel', () => ({
  analytics: { track: vi.fn() },
}));

import { MeetingTermsPage } from '@/app/pages/meeting-terms-page';

function renderMeet(state?: { fromReady?: boolean }) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/meet', state }]}>
      <Routes>
        <Route path="/meet" element={<MeetingTermsPage />} />
        <Route path="/ready" element={<div>ready-page-stub</div>} />
      </Routes>
    </MemoryRouter>
  );
}

const backButton = () => screen.queryByRole('button', { name: /back/i });

describe('P1083 — /meet conditional back button', () => {
  it('is visible when arrival state carries fromReady: true', () => {
    renderMeet({ fromReady: true });
    expect(backButton()).toBeInTheDocument();
  });

  it('is absent on a direct /meet visit with no route state', () => {
    renderMeet(undefined);
    expect(backButton()).not.toBeInTheDocument();
  });

  it('is absent when route state exists but fromReady is not true', () => {
    renderMeet({ fromReady: false });
    expect(backButton()).not.toBeInTheDocument();
  });

  it('returns to /ready when tapped', () => {
    renderMeet({ fromReady: true });
    fireEvent.click(backButton()!);
    expect(screen.getByText('ready-page-stub')).toBeInTheDocument();
  });
});
