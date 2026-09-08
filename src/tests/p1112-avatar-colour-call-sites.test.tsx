/**
 * @file p1112-avatar-colour-call-sites.test.tsx
 * @description P1112 canary: two more `GravatarAvatar` call sites wire `isPledger`
 * from live data but drop `avatarColor`, so the avatar falls back to the component
 * default (#0044CC). Same bug class as P1109, different files.
 *
 * `ClaritySessions` is exported, so it gets a real render assertion.
 * `PointCardFull` (profile-page-v2.tsx) is module-private and unreachable from a
 * render — it is asserted at the source level instead, the way p1179/p1210 do it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ClaritySessions, type ClarityUser, type Verification } from '@/app/components/social/ClaritySessions';

const AVATAR_COLOR = '#FF5733';

const users: Record<string, ClarityUser> = {
  'verifier-1': { id: 'verifier-1', name: 'Story Owner', hasPledged: false },
  'verified-1': {
    id: 'verified-1',
    name: 'Understander',
    hasPledged: true,
    avatarColor: AVATAR_COLOR,
  },
};

const verifications: Verification[] = [
  {
    sessionId: 'session-1',
    verifierId: 'verifier-1',
    verifiedId: 'verified-1',
    rating: 8,
    isAcrossDisagreement: true,
  },
];

describe('P1112: avatar colour at the session-list and profile identity-row call sites', () => {
  it('renders the session-list avatar in the person real avatar colour', () => {
    render(
      <BrowserRouter>
        <ClaritySessions
          verifications={verifications}
          getUserById={(id) => users[id]}
        />
      </BrowserRouter>
    );

    const avatars = screen.getAllByTestId('gravatar-avatar');
    expect(avatars).toHaveLength(1);
    // Falls back to rgb(0, 68, 204) when avatarColor is dropped at the boundary.
    expect(avatars[0].style.backgroundColor).toBe('rgb(255, 87, 51)');
  });

  it('keeps the pledge ring on the session-list avatar (regression guard: the fix must not touch isPledger)', () => {
    render(
      <BrowserRouter>
        <ClaritySessions
          verifications={verifications}
          getUserById={(id) => users[id]}
        />
      </BrowserRouter>
    );

    expect(screen.getAllByTestId('gravatar-avatar')[0]).toHaveAttribute('data-pledger', 'true');
  });

  it('does not force the ring on for a non-pledged person', () => {
    const nonPledged: Record<string, ClarityUser> = {
      ...users,
      'verified-1': { ...users['verified-1']!, hasPledged: false },
    };

    render(
      <BrowserRouter>
        <ClaritySessions
          verifications={verifications}
          getUserById={(id) => nonPledged[id]}
        />
      </BrowserRouter>
    );

    expect(screen.getAllByTestId('gravatar-avatar')[0]).not.toHaveAttribute('data-pledger');
  });

  it('passes avatarColor at every GravatarAvatar call site in profile-page-v2.tsx', () => {
    const source = readFileSync(
      resolve(__dirname, '../app/pages/profile-page-v2.tsx'),
      'utf8'
    );

    // Split on the opening tag: every chunk after the first is one call site's props,
    // up to its closing `/>`.
    const chunks = source.split('<GravatarAvatar').slice(1);
    expect(chunks.length).toBeGreaterThan(0);

    // Codex review of this canary: an earlier version accepted any `avatarColor=`
    // SUBSTRING inside the opening tag, so a JSX comment mentioning the prop would
    // have kept it green while the real prop was absent. Strip JSX comments first,
    // then require the prop to be bound to an actual expression, not just named.
    const boundToExpression = /(^|\s)avatarColor=\{[^}]+\}/;
    const missing = chunks
      .map(chunk => chunk.slice(0, chunk.indexOf('/>')).replace(/\{\/\*[\s\S]*?\*\/\}/g, ''))
      .filter(props => !boundToExpression.test(props));

    expect(missing.map(p => p.trim())).toEqual([]);
  });
});
