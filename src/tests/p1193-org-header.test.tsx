/**
 * @file p1193-org-header.test.tsx
 * @description P1193 — the organizer badge and the last-organizer leave guard, at the
 * component boundary where both are decided.
 *
 * WHY HERE AND NOT ONLY IN E2E. The leave guard has four states (plain member,
 * organizer with a co-organizer, sole organizer, unknown organizer count) and the
 * fourth is only reachable when a network call FAILS — org-page's loadRoster swallows
 * its error by design. Staging that in a browser means breaking a fetch mid-run; here
 * it is a prop. The e2e suite covers the states a user can reach by clicking; this
 * covers the one they can only reach when something breaks.
 *
 * Every test asserts BOTH directions. A suite that only proved "the sole organizer
 * cannot leave" would pass against a component that had stopped rendering Leave
 * entirely — which would silently trap every ordinary member in every group.
 *
 * NOTE ON SCOPE: this proves the BUTTON. It is not the guard. The authoritative one is
 * the BEFORE DELETE trigger, and it is unreachable from jsdom — see
 * e2e/integration/p1193-last-organizer-guard.spec.ts, which goes at the database
 * directly and is the test that would catch a UI-only implementation.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { OrgHeader } from '@/app/components/organizations/org-header';
import type { Organization, OrgRole } from '@/app/data/organizations-service.interface';

const org = {
  id: 'org-1',
  slug: 'cm',
  name: '· Chiang Mai',
  blurb: null,
  visibility: 'public',
  hasEvents: true,
} as unknown as Organization;

function renderHeader(opts: {
  myRole?: OrgRole | null;
  organizerCount?: number | null;
  isMember?: boolean;
}) {
  return render(
    <BrowserRouter>
      <OrgHeader
        org={org}
        memberCount={11}
        isMember={opts.isMember ?? opts.myRole !== null}
        myRole={opts.myRole ?? null}
        organizerCount={opts.organizerCount ?? null}
        onJoin={vi.fn()}
        onLeave={vi.fn()}
      />
    </BrowserRouter>,
  );
}

/** Opens the "Manage membership" dropdown — the only place Leave has ever lived. */
async function openManageMembership() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /manage membership/i }));
  return user;
}

describe('P1193 — the organizer role reaches the header', () => {
  it('badges an organizer beside the group name', () => {
    renderHeader({ myRole: 'organizer', organizerCount: 2 });
    expect(screen.getByTestId('org-role-badge')).toHaveTextContent('Organizer');
  });

  it('shows NO role badge for a plain member — their view is unchanged', () => {
    renderHeader({ myRole: 'member', organizerCount: 1 });
    expect(screen.queryByTestId('org-role-badge')).not.toBeInTheDocument();
  });

  it('shows NO role badge for a signed-out visitor', () => {
    renderHeader({ myRole: null, organizerCount: 1, isMember: false });
    expect(screen.queryByTestId('org-role-badge')).not.toBeInTheDocument();
    // The non-member CTA is still the one thing on offer.
    expect(screen.getByRole('button', { name: /join as member/i })).toBeInTheDocument();
  });

  it('never renders the founder\'s own word "lead" anywhere a person can read it', () => {
    // Explicit spec constraint: `lead` was the founder's word in session and is not
    // the product's. Guards against it drifting back in as a label or a tooltip.
    const { container } = renderHeader({ myRole: 'organizer', organizerCount: 2 });
    expect(container.textContent ?? '').not.toMatch(/\blead\b/i);
  });
});

describe('P1193 — the last organizer cannot leave', () => {
  it('offers Leave to a plain member', async () => {
    renderHeader({ myRole: 'member', organizerCount: 1 });
    await openManageMembership();
    expect(await screen.findByRole('menuitem', { name: /leave/i })).toBeInTheDocument();
    expect(screen.queryByTestId('org-leave-blocked')).not.toBeInTheDocument();
  });

  it('offers Leave to an organizer when a SECOND organizer exists', async () => {
    renderHeader({ myRole: 'organizer', organizerCount: 2 });
    await openManageMembership();
    expect(await screen.findByRole('menuitem', { name: /leave/i })).toBeInTheDocument();
    expect(screen.queryByTestId('org-leave-blocked')).not.toBeInTheDocument();
  });

  it('withholds Leave from the SOLE organizer and says why', async () => {
    renderHeader({ myRole: 'organizer', organizerCount: 1 });
    await openManageMembership();
    const reason = await screen.findByTestId('org-leave-blocked');
    // The founder's exact line, 2026-08-31 — not a paraphrase.
    expect(reason).toHaveTextContent("You're the only organizer of this group.");
    // Withheld, not disabled: a rendered-then-disabled control is the dead-control
    // pattern P955 bans, and it is what a careless fix here would produce.
    expect(screen.queryByRole('menuitem', { name: /leave/i })).not.toBeInTheDocument();
  });

  it('withholds Leave from an organizer when the roster failed to load — unknown is not zero', async () => {
    // organizerCount === null. Reading it as 0 would UNBLOCK the sole organizer this
    // guard exists for; reading it as "no others" would block someone who has three
    // co-organizers. Neither is safe, so it refuses and names the reason.
    renderHeader({ myRole: 'organizer', organizerCount: null });
    await openManageMembership();
    const reason = await screen.findByTestId('org-leave-blocked');
    expect(reason).toHaveTextContent("Can't check group organizers right now — reload and try again.");
    expect(screen.queryByRole('menuitem', { name: /leave/i })).not.toBeInTheDocument();
  });

  it('still offers Leave to a plain MEMBER when the roster failed to load', async () => {
    // The degraded path is scoped to organizers. A member can never strand a group,
    // so blocking them would refuse an action that was never at risk — the
    // false-positive half of this guard, and the half nothing else would catch.
    renderHeader({ myRole: 'member', organizerCount: null });
    await openManageMembership();
    expect(await screen.findByRole('menuitem', { name: /leave/i })).toBeInTheDocument();
    expect(screen.queryByTestId('org-leave-blocked')).not.toBeInTheDocument();
  });
});

describe('P1193 — the header speaks about groups, not organizations', () => {
  it('names the confirm dialog after a group', async () => {
    renderHeader({ myRole: 'member', organizerCount: 2 });
    const user = await openManageMembership();
    await user.click(await screen.findByRole('menuitem', { name: /leave/i }));
    expect(await screen.findByText('Leave this group?')).toBeInTheDocument();
  });

  it('mints invite links on /groups, carrying ?from= attribution', async () => {
    // The link must point at the canonical path, not at /org. /org still works — it
    // redirects — but minting NEW links onto a legacy path sends every future invite
    // through a redirect hop and quietly makes the old route load-bearing again.
    // ?from= is P1076 attribution and has to survive into the link at all.
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <OrgHeader
          org={org}
          memberCount={11}
          isMember
          myRole="member"
          organizerCount={2}
          currentUserId="user-id-1234"
          onJoin={vi.fn()}
          onLeave={vi.fn()}
        />
      </BrowserRouter>,
    );
    await user.click(screen.getByRole('button', { name: /invite/i }));

    // The dialog renders the link as text in a <pre>, not an input.
    expect(
      await screen.findByText(`${window.location.origin}/groups/cm?from=user-id-1234`),
    ).toBeInTheDocument();
  });
});
