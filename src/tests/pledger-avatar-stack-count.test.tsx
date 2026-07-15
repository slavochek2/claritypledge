/**
 * The avatar stack's overflow badge must reconcile with its caption:
 *   (avatars rendered) + (badge number) === (caption total)
 *
 * It did not. The badge computed `totalCount - AVATAR_ROW_LIMIT_DESKTOP` (8) while the
 * row could only ever render `MAX_FEATURED_PROFILES` (6) — getFeaturedProfiles() slices
 * to 6, so the desktop limit of 8 is unreachable. Every desktop visitor saw a count short
 * by exactly 2 ("Join 691" · 6 avatars · "+683" → 689). Mobile was correct only by luck
 * (its limit, 5, is under the cap).
 *
 * The arithmetic is asserted against the RENDERED count rather than the limit, so the
 * invariant survives any future change to either constant. That coupling — a badge
 * derived from a limit instead of from what was drawn — was the bug.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PledgerAvatarStack } from "@/app/components/landing/social-proof";
import { MAX_FEATURED_PROFILES, AVATAR_ROW_LIMIT_MOBILE, AVATAR_ROW_LIMIT_DESKTOP } from "@/app/data/api";

const TOTAL = 691;

const makeProfiles = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `id-${i}`,
    name: `Person ${i}`,
    slug: `person-${i}`,
    avatarColor: "#3b82f6",
    avatarUrl: null,
    hasPledged: true,
  }));

vi.mock("@/app/data/api", async () => {
  const actual = await vi.importActual<typeof import("@/app/data/api")>("@/app/data/api");
  return {
    ...actual,
    getFeaturedProfiles: vi.fn(),
    getVerifiedProfileCount: vi.fn(),
  };
});

const api = await import("@/app/data/api");

describe("PledgerAvatarStack — badge arithmetic reconciles with the caption", () => {
  beforeEach(() => {
    vi.mocked(api.getVerifiedProfileCount).mockResolvedValue(TOTAL);
    // The real query can never return more than this — api.ts slices to MAX_FEATURED_PROFILES.
    vi.mocked(api.getFeaturedProfiles).mockResolvedValue(makeProfiles(MAX_FEATURED_PROFILES) as never);
  });

  it("the desktop limit is not reachable — the badge must not assume it is", () => {
    // This is the precondition that made the bug permanent rather than occasional.
    expect(AVATAR_ROW_LIMIT_DESKTOP).toBeGreaterThan(MAX_FEATURED_PROFILES);
  });

  it("renders +N such that avatars + N === the caption total", async () => {
    render(
      <MemoryRouter>
        <PledgerAvatarStack />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(`Join ${TOTAL} who've taken the pledge`)).toBeInTheDocument());

    // Both rows render (CSS hides one); assert each reconciles on its own.
    const badges = screen.getAllByText(/^\+\d+$/);
    expect(badges.length).toBeGreaterThan(0);

    const shownMobile = Math.min(MAX_FEATURED_PROFILES, AVATAR_ROW_LIMIT_MOBILE);
    const shownDesktop = Math.min(MAX_FEATURED_PROFILES, AVATAR_ROW_LIMIT_DESKTOP);

    const numbers = badges.map((b) => Number(b.textContent!.replace("+", "")));
    // Pre-fix this was [686, 683] → desktop's 6 + 683 = 689, two people vanish.
    expect(numbers).toEqual([TOTAL - shownMobile, TOTAL - shownDesktop]);
    expect(shownDesktop + (TOTAL - shownDesktop)).toBe(TOTAL);
  });

  it("shows no badge when everyone fits in the row", async () => {
    vi.mocked(api.getVerifiedProfileCount).mockResolvedValue(3);
    vi.mocked(api.getFeaturedProfiles).mockResolvedValue(makeProfiles(3) as never);

    render(
      <MemoryRouter>
        <PledgerAvatarStack />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText(/Join 3 who've taken the pledge/)).toBeInTheDocument());
    // A "+0" badge would be the other face of the same limit-vs-rendered confusion.
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument();
  });
});
