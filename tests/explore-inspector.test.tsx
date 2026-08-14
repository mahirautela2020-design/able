import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { InspectorPanel } from "@/components/workbench/explore/inspector-panel";
import type { InspectedElement } from "@/lib/explore/types";

const el: InspectedElement = {
  role: "button",
  name: "Subscribe",
  tag: "button",
  selector: "#cta",
  aria: { "aria-expanded": "false" },
  fontSize: "16px",
  touchTarget: { width: 120, height: 40 },
  tabIndex: 0,
  ancestors: ["main"],
  bbox: { x: 0, y: 0, width: 120, height: 40 },
  computed: { color: "#7a7a7a", backgroundColor: "#ffffff" },
  hasText: true,
};

describe("InspectorPanel", () => {
  it("shows accessible name and role", () => {
    render(<InspectorPanel element={el} />);
    expect(screen.getByText("Subscribe")).toBeInTheDocument();
    expect(screen.getByText("button")).toBeInTheDocument();
    expect(screen.getByText("16px")).toBeInTheDocument();
    expect(screen.getByText("120×40")).toBeInTheDocument();
  });

  it("shows ARIA attributes", () => {
    render(<InspectorPanel element={el} />);
    expect(screen.getByText("aria-expanded")).toBeInTheDocument();
  });

  it("shows empty state when nothing picked", () => {
    render(<InspectorPanel element={null} />);
    expect(screen.getByTestId("inspector-empty")).toBeInTheDocument();
  });

  it("maps an unlabelled image to the 1.1.1 criterion chip", () => {
    const img: InspectedElement = {
      ...el,
      role: "img",
      name: "",
      tag: "img",
      touchTarget: { width: 280, height: 80 },
    };
    render(<InspectorPanel element={img} />);
    expect(screen.getByText("1.1.1")).toBeInTheDocument();
  });
});
