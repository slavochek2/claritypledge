import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
const track = vi.fn();
vi.mock("@/lib/mixpanel", () => ({ analytics: { track: (...a: unknown[]) => track(...a) } }));
import { ManifestoFilm } from "@/app/components/manifesto/manifesto-film";

const BUCKET = "https://storage.googleapis.com/claritypledge-story-images/manifesto/";

describe("P1682 manifesto film", () => {
  it("shows a click-to-play poster from the public media bucket, nothing loaded until play", () => {
    const { container } = render(<ManifestoFilm />);
    expect(screen.getByRole("button", { name: /play the manifesto film/i })).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(`${BUCKET}the-clarity-tax-poster-v3.jpg`);
    expect(screen.getByTestId("video-duration-badge").textContent).toBe("1:54");
    expect(container.querySelector("video")).toBeNull();
  });

  it("click mounts the film from the bucket and tracks one play", () => {
    track.mockClear();
    const { container } = render(<ManifestoFilm />);
    fireEvent.click(screen.getByRole("button", { name: /play the manifesto film/i }));
    expect(container.querySelector("video")?.getAttribute("src")).toBe(`${BUCKET}the-clarity-tax-v1.mp4`);
    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("manifesto_film_play", { location: "manifesto" });
  });
});
