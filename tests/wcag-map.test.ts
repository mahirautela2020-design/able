import { describe, it, expect } from "vitest";
import { mapElementToScs } from "@/lib/explore/wcag-map";
import type { InspectedElement } from "@/lib/explore/types";

const base: InspectedElement = {
  tag: "button",
  selector: "#x",
  aria: {},
  fontSize: "16px",
  tabIndex: 0,
  ancestors: ["main"],
  bbox: { x: 0, y: 0, width: 100, height: 40 },
  computed: { color: "#000000", backgroundColor: "#ffffff" },
  role: "button",
  name: "",
  touchTarget: { width: 120, height: 40 },
};

describe("mapElementToScs", () => {
  it("img without a name maps to 1.1.1", () => {
    const el: InspectedElement = { ...base, role: "img", name: "", touchTarget: { width: 280, height: 80 } };
    expect(mapElementToScs(el)).toContain("1.1.1");
  });

  it("unlabelled button maps to 4.1.2 and 1.3.1", () => {
    const el: InspectedElement = { ...base, role: "button", name: "" };
    const scs = mapElementToScs(el);
    expect(scs).toContain("4.1.2");
    expect(scs).toContain("1.3.1");
  });

  it("small touch target maps to 2.5.8", () => {
    const el: InspectedElement = { ...base, role: "link", name: "x", touchTarget: { width: 20, height: 20 } };
    expect(mapElementToScs(el)).toContain("2.5.8");
  });

  it("well-labelled large element maps to nothing", () => {
    const el: InspectedElement = { ...base, role: "button", name: "Subscribe", touchTarget: { width: 120, height: 40 } };
    expect(mapElementToScs(el)).toEqual([]);
  });
});
