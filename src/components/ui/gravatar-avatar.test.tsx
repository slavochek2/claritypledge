import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GravatarAvatar } from "./gravatar-avatar";

describe("GravatarAvatar", () => {
  // Helper to get the avatar div (second child, the inner div with the avatar)
  const getAvatarDiv = (container: HTMLElement) => {
    const wrapper = container.firstChild as HTMLElement;
    return wrapper.firstChild as HTMLElement;
  };

  // UAT-1.1: isPledger prop adds static blue ring (Instagram/Telegram-style)
  describe("isPledger prop", () => {
    it("adds blue ring with white gap when isPledger is true", () => {
      const { container } = render(
        <GravatarAvatar name="Test User" isPledger={true} />
      );
      const avatar = getAvatarDiv(container);

      // Should have ring-blue-500 class (static ring, no animation)
      expect(avatar.className).toContain("ring-blue-500");
      // Should have ring-offset for white gap (Instagram/Telegram-style)
      expect(avatar.className).toContain("ring-offset-2");
      expect(avatar.className).toContain("ring-offset-background");
    });

    // UAT-1.2: isPledger=false has no ring
    it("has no ring when isPledger is false", () => {
      const { container } = render(
        <GravatarAvatar name="Test User" isPledger={false} />
      );
      const avatar = getAvatarDiv(container);

      expect(avatar.className).not.toContain("ring-blue-500");
    });

    it("has no ring when isPledger is false", () => {
      const { container } = render(<GravatarAvatar name="Test User" isPledger={false} />);
      const avatar = getAvatarDiv(container);

      expect(avatar.className).not.toContain("ring-blue-500");
    });
  });

  // UAT-1.3: showPledgeBadge renders checkmark with accessibility
  describe("showPledgeBadge prop", () => {
    it("renders checkmark badge with accessibility when showPledgeBadge is true", () => {
      render(<GravatarAvatar name="Test User" isPledger={false} showPledgeBadge={true} />);

      const badge = screen.getByLabelText("Verified pledger");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute("aria-label", "Verified pledger");
      expect(badge).toHaveAttribute("role", "img");    });

    // UAT-1.6: Badge hidden by default
    it("does not render badge when showPledgeBadge is false", () => {
      render(<GravatarAvatar name="Test User" isPledger={false} showPledgeBadge={false} />);

      const badge = screen.queryByLabelText("Verified pledger");
      expect(badge).not.toBeInTheDocument();
    });

    it("does not render badge when showPledgeBadge is omitted", () => {
      render(<GravatarAvatar name="Test User" isPledger={false} />);

      const badge = screen.queryByLabelText("Verified pledger");
      expect(badge).not.toBeInTheDocument();
    });
  });

  // UAT-1.4: All sizes render ring correctly
  describe("ring at different sizes", () => {
    it("renders ring-2 for sm size with isPledger", () => {
      const { container } = render(
        <GravatarAvatar name="Test User" size="sm" isPledger={true} />
      );
      const avatar = getAvatarDiv(container);

      expect(avatar.className).toContain("ring-2");
      expect(avatar.className).toContain("ring-blue-500");
    });

    it("renders ring-2 for md size with isPledger", () => {
      const { container } = render(
        <GravatarAvatar name="Test User" size="md" isPledger={true} />
      );
      const avatar = getAvatarDiv(container);

      expect(avatar.className).toContain("ring-2");
      expect(avatar.className).toContain("ring-blue-500");
    });

    it("renders thicker ring for lg size with isPledger", () => {
      const { container } = render(
        <GravatarAvatar name="Test User" size="lg" isPledger={true} />
      );
      const avatar = getAvatarDiv(container);

      // lg size uses a thicker ring (ring-3 or ring-[3px])
      expect(avatar.className).toMatch(/ring-3|ring-\[3px\]/);
      expect(avatar.className).toContain("ring-blue-500");
    });
  });

  // Basic functionality tests (existing behavior)
  describe("basic functionality", () => {
    it("renders initials when no photoUrl provided", () => {
      render(<GravatarAvatar name="John Doe" isPledger={false} />);
      expect(screen.getByText("JD")).toBeInTheDocument();
    });

    it("renders image when photoUrl provided", () => {
      render(
        <GravatarAvatar
          name="John Doe"
          isPledger={false}
          photoUrl="https://example.com/avatar.jpg"
        />
      );
      const img = screen.getByAltText("John Doe's avatar");
      expect(img).toBeInTheDocument();
    });
  });
});
