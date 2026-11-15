import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("@/lib/mixpanel", () => ({ analytics: { track: vi.fn() } }));
import { ManifestoFilm } from "@/app/components/manifesto/manifesto-film";

describe("P1682 manifesto film", () => {
  it("shows a click-to-play poster from the public media bucket, nothing loaded until play", () => {
    const { container } = render(<ManifestoFilm />);
    expect(screen.getByRole("button", { name: /play the manifesto film/i })).toBeTruthy();
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(
      "https://storage.googleapis.com/claritypledge-story-images/manifesto/the-clarity-tax-poster-v3.jpg",
    );
    expect(container.querySelector("video")).toBeNull();
  });
});
