import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AxTree } from "@/components/workbench/ax-tree";
import type { AxNode } from "@/lib/axe/types";

const mockTree: AxNode = {
  name: "Example Homepage",
  role: "WebArea",
  children: [
    {
      name: "Example Corp",
      role: "banner",
      children: [
        { name: "Home", role: "link", children: [] },
        { name: "About", role: "link", children: [] },
      ],
    },
    {
      name: "",
      role: "main",
      children: [
        {
          name: "Welcome",
          role: "heading",
          level: 1,
          children: [],
        },
        {
          name: "Click me",
          role: "button",
          children: [],
          properties: { invalid: false },
        },
      ],
    },
    {
      name: "Footer",
      role: "contentinfo",
      children: [],
    },
  ],
};

describe("ax-snapshot", () => {
  it("renders the accessibility tree from fixture JSON", () => {
    render(<AxTree root={mockTree} />);

    const elements = screen.getAllByText(/WebArea|banner|main|contentinfo/);
    expect(elements.length).toBeGreaterThanOrEqual(4);
  });

  it("shows node names in quotes", () => {
    render(<AxTree root={mockTree} />);

    expect(screen.getByText('\u201cExample Corp\u201d')).toBeInTheDocument();
    expect(screen.getByText('\u201cHome\u201d')).toBeInTheDocument();
    expect(screen.getByText('\u201cWelcome\u201d')).toBeInTheDocument();
    expect(screen.getByText('\u201cFooter\u201d')).toBeInTheDocument();
  });

  it("shows heading level", () => {
    render(<AxTree root={mockTree} />);

    expect(screen.getByText(/heading.*\(h1\)|\(h1\)/)).toBeInTheDocument();
  });

  it("shows properties for nodes that have them", () => {
    render(<AxTree root={mockTree} />);

    expect(screen.getByText('{"invalid":false}')).toBeInTheDocument();
  });

  it("shows link roles", () => {
    render(<AxTree root={mockTree} />);

    const links = screen.getAllByText("link");
    expect(links.length).toBeGreaterThanOrEqual(2);
  });
});
