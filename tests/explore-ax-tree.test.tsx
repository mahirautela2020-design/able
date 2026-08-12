import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AxTree } from "@/components/workbench/ax-tree";
import { AxTreePanel } from "@/components/workbench/explore/ax-tree-panel";
import type { AxSnapshot } from "@/lib/axe/types";

const snapshot: AxSnapshot = {
  name: "Demo",
  role: "WebArea",
  children: [
    {
      name: "Subscribe",
      role: "button",
      children: [],
    },
    {
      name: "Search",
      role: "textbox",
      children: [],
    },
  ],
};

describe("AxTree interactive", () => {
  it("clicking a node calls onNodeClick with role and name", () => {
    const onNodeClick = vi.fn();
    render(<AxTree root={snapshot} onNodeClick={onNodeClick} />);
    fireEvent.click(screen.getByText(/Subscribe/));
    expect(onNodeClick).toHaveBeenCalledWith("button", "Subscribe");
  });

  it("renders node roles", () => {
    render(<AxTree root={snapshot} onNodeClick={() => {}} />);
    expect(screen.getByText("button")).toBeInTheDocument();
    expect(screen.getByText("textbox")).toBeInTheDocument();
  });
});

describe("AxTreePanel", () => {
  it("renders the tree when a snapshot is present", () => {
    render(<AxTreePanel snapshot={snapshot} loading={false} error={null} onSelectNode={() => {}} />);
    expect(screen.getByTestId("ax-tree-panel")).toBeInTheDocument();
  });

  it("renders loading, error, and empty states", () => {
    const { rerender } = render(
      <AxTreePanel snapshot={null} loading={true} error={null} onSelectNode={() => {}} />
    );
    expect(screen.getByTestId("ax-tree-loading")).toBeInTheDocument();

    rerender(<AxTreePanel snapshot={null} loading={false} error="boom" onSelectNode={() => {}} />);
    expect(screen.getByTestId("ax-tree-error")).toBeInTheDocument();

    rerender(<AxTreePanel snapshot={null} loading={false} error={null} onSelectNode={() => {}} />);
    expect(screen.getByTestId("ax-tree-empty")).toBeInTheDocument();
  });
});
