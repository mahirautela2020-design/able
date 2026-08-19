import { ImageResponse } from "next/og";

export const alt = "ScanA11y — WCAG 2.2 Accessibility Auditor";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Satori (next/og's renderer) only supports hex/rgb colors, not oklch() --
// these are the flattened equivalents of the dark-theme tokens in
// globals.css (--background/--foreground) plus the existing green-500
// "complete" status accent already used elsewhere in the UI (see
// SEVERITY_DOT / status dots in workbench.tsx), so the card matches the
// app's actual look instead of introducing a new color.
const BG = "#0a0a0a";
const FG = "#fafafa";
const MUTED = "#a1a1a1";
const ACCENT = "#22c55e";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: BG,
          color: FG,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 72,
              height: 72,
              borderRadius: 20,
              backgroundColor: ACCENT,
              fontSize: 40,
              fontWeight: 700,
              color: BG,
            }}
          >
            ✓
          </div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: -1 }}>
            ScanA11y
          </div>
        </div>

        <div style={{ display: "flex", marginTop: 28, fontSize: 34, color: MUTED }}>
          WCAG 2.2 accessibility auditor — open source
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 48 }}>
          {["URL", "Figma", "Screenshot", "APK", "iOS"].map((mode) => (
            <div
              key={mode}
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 999,
                border: `1px solid #333`,
                fontSize: 24,
                color: FG,
              }}
            >
              {mode}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", marginTop: 56, fontSize: 24, color: MUTED }}>
          Evidence-first findings · WCAG compliance matrix · axe-core, zero paid APIs
        </div>
      </div>
    ),
    { ...size }
  );
}
