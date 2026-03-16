import { render, screen } from "@testing-library/react";
import { ClarityLoader, ClarityPageLoader } from "./clarity-loader";

describe("ClarityLoader", () => {
  it("renders SVG with the brand C path", () => {
    const { container } = render(<ClarityLoader />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    const path = container.querySelector("path");
    expect(path).toBeTruthy();
    expect(path?.getAttribute("d")).toContain("C");
  });

  it("renders at default size (md = 48px)", () => {
    const { container } = render(<ClarityLoader />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("48");
    expect(svg?.getAttribute("height")).toBe("48");
  });

  it("renders at sm size (32px)", () => {
    const { container } = render(<ClarityLoader size="sm" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("renders at lg size (64px)", () => {
    const { container } = render(<ClarityLoader size="lg" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("64");
    expect(svg?.getAttribute("height")).toBe("64");
  });

  it("applies custom className", () => {
    const { container } = render(<ClarityLoader className="my-custom-class" />);
    const svg = container.querySelector("svg");
    expect(svg?.classList.contains("my-custom-class")).toBe(true);
  });

  it("SVG path has stroke-dasharray attribute (animation setup)", () => {
    const { container } = render(<ClarityLoader />);
    const path = container.querySelector("path");
    expect(path?.getAttribute("stroke-dasharray")).toBe("200");
  });
});

describe("ClarityPageLoader", () => {
  it("renders the ClarityLoader SVG", () => {
    render(<ClarityPageLoader />);
    expect(screen.getByRole("img", { name: "Loading" })).toBeTruthy();
  });

  it("has the min-h-screen centering layout", () => {
    const { container } = render(<ClarityPageLoader />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.classList.contains("min-h-screen")).toBe(true);
    expect(wrapper.classList.contains("flex")).toBe(true);
    expect(wrapper.classList.contains("items-center")).toBe(true);
    expect(wrapper.classList.contains("justify-center")).toBe(true);
  });

  it("has CSS anti-flash class", () => {
    const { container } = render(<ClarityPageLoader />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.classList.contains("clarity-page-loader")).toBe(true);
  });

  it("does not render any text (logo only)", () => {
    const { container } = render(<ClarityPageLoader />);
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("p")).toBeNull();
  });
});

describe("Integration: exports are stable", () => {
  it("exports ClarityLoader and ClarityPageLoader as functions", () => {
    expect(typeof ClarityLoader).toBe("function");
    expect(typeof ClarityPageLoader).toBe("function");
  });
});
