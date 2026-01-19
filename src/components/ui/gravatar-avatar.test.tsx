import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GravatarAvatar } from "./gravatar-avatar";

describe("GravatarAvatar", () => {
  // Helper to get the avatar div (second child, the inner div with the avatar)
  const getAvatarDiv = (container: HTMLElement) => {
    const wrapper = container.firstChild as HTMLElement;
    return wrapper.firstChild as HTMLElement;
  };

  // UAT-1.1: isPledger prop adds blue ring with animation
  describe("isPledger prop", () => {
    it("adds blue ring and glow-pulse animation when isPledger is true", () => {
      const { container } = render(
        <GravatarAvatar name="Test User" isPledger={true} />
      );
      const avatar = getAvatarDiv(container);

      // Should have ring-blue-500 and animate-glow-pulse classes
      expect(avatar.className).toContain("ring-blue-500");
      expect(avatar.className).toContain("animate-glow-pulse");
    });

    // UAT-1.2: isPledger=false has no ring
    it("has no ring or animation when isPledger is false", () => {
      const { container } = render(
        <GravatarAvatar name="Test User" isPledger={false} />
      );
      const avatar = getAvatarDiv(container);

      expect(avatar.className).not.toContain("ring-blue-500");
      expect(avatar.className).not.toContain("animate-glow-pulse");
    });

    it("has no ring or animation when isPledger is omitted", () => {
      const { container } = render(<GravatarAvatar name="Test User" />);
      const avatar = getAvatarDiv(container);

      expect(avatar.className).not.toContain("ring-blue-500");
      expect(avatar.className).not.toContain("animate-glow-pulse");
    });
  });

  // UAT-1.3: showPledgeBadge renders checkmark with accessibility
  describe("showPledgeBadge prop", () => {
    it("renders checkmark badge with accessibility when showPledgeBadge is true", () => {
      render(<GravatarAvatar name="Test User" showPledgeBadge={true} />);

      const badge = screen.getByLabelText("Verified pledger");
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute("aria-label", "Verified pledger");
    });

    // UAT-1.6: Badge hidden by default
    it("does not render badge when showPledgeBadge is false", () => {
      render(<GravatarAvatar name="Test User" showPledgeBadge={false} />);

      const badge = screen.queryByLabelText("Verified pledger");
      expect(badge).not.toBeInTheDocument();
    });

    it("does not render badge when showPledgeBadge is omitted", () => {
      render(<GravatarAvatar name="Test User" />);

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

    it("renders ring-3 for lg size with isPledger", () => {
      const { container } = render(
        <GravatarAvatar name="Test User" size="lg" isPledger={true} />
      );
      const avatar = getAvatarDiv(container);

      expect(avatar.className).toContain("ring-3");
      expect(avatar.className).toContain("ring-blue-500");
    });
  });

  // Basic functionality tests (existing behavior)
  describe("basic functionality", () => {
    it("renders initials when no photoUrl provided", () => {
      render(<GravatarAvatar name="John Doe" />);
      expect(screen.getByText("JD")).toBeInTheDocument();
    });

    it("renders image when photoUrl provided", () => {
      render(
        <GravatarAvatar
          name="John Doe"
          photoUrl="https://example.com/avatar.jpg"
        />
      );
      const img = screen.getByAltText("John Doe's avatar");
      expect(img).toBeInTheDocument();
    });
  });
});
