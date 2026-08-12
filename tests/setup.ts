import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import React from "react";

afterEach(() => {
  cleanup();
});

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/scope/test-audit-id"),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/link", () => {
  const MockLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }>(
    ({ href, children, ...props }, ref) => React.createElement("a", { ref, href, ...props }, children)
  );
  MockLink.displayName = "MockLink";
  return { default: MockLink };
});
