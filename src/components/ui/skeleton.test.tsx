import { render } from "@testing-library/react";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders one grey, pulsing, rounded block", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveClass("animate-pulse", "bg-muted", "rounded");
  });

  it("is hidden from assistive tech: the loader or page label says what is loading", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("takes its size and shape from className and keeps the base look", () => {
    const { container } = render(<Skeleton className="h-4 w-1/3" />);
    expect(container.firstElementChild).toHaveClass("h-4", "w-1/3", "animate-pulse", "bg-muted");
  });

  it("lets className replace the radius and colour instead of stacking a second one", () => {
    const { container } = render(<Skeleton className="rounded-full bg-muted/50" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveClass("rounded-full", "bg-muted/50");
    expect(el).not.toHaveClass("rounded");
    expect(el).not.toHaveClass("bg-muted");
  });

  it("adds no layout of its own", () => {
    const { container } = render(<Skeleton />);
    const cls = (container.firstElementChild as HTMLElement).className.split(" ");
    expect(cls.filter((c) => /^(block|inline|flex|grid|w-|h-|m[trblxy]?-|p[trblxy]?-|min-|max-)/.test(c))).toEqual([]);
  });

  it("can be a span, for a skeleton that sits inside text", () => {
    const { container } = render(<Skeleton as="span" className="inline-block h-3.5 w-24" />);
    expect(container.firstElementChild?.tagName).toBe("SPAN");
  });

  it("stays announced when the caller gives it a role and a label", () => {
    const { getByRole } = render(<Skeleton role="status" aria-label="Loading name" />);
    expect(getByRole("status", { name: "Loading name" })).not.toHaveAttribute("aria-hidden");
  });
});
