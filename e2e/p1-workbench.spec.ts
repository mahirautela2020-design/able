import { test, expect } from "@playwright/test";

const FIXTURE_AUDIT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

test.describe("P1 — Explore Workbench smoke tests", () => {
  test("scope page loads with audit detail", async ({ page }) => {
    await page.goto(`/scope/${FIXTURE_AUDIT_ID}`);

    await expect(page.locator("h1")).toContainText("https://example.com");
    await expect(page.locator("text=complete")).toBeVisible();
    await expect(page.locator("text=3 pages")).toBeVisible();
    await expect(page.locator("text=Example Homepage")).toBeVisible();
  });

  test("findings page loads grouped by criterion", async ({ page }) => {
    await page.goto(`/scope/${FIXTURE_AUDIT_ID}/findings`);

    await expect(page.locator("h1")).toContainText("Findings");
    await expect(page.locator("text=1.4.3")).toBeVisible();
    await expect(page.locator("text=1.1.1")).toBeVisible();
  });

  test("click finding opens detail slide-over", async ({ page }) => {
    await page.goto(`/scope/${FIXTURE_AUDIT_ID}/findings`);

    const findingButton = page.locator("button", {
      hasText: "Elements must meet minimum color contrast ratio thresholds",
    });
    await findingButton.first().click();

    await expect(page.locator("text=Finding Detail")).toBeVisible();
    await expect(page.locator("text=color-contrast")).toBeVisible();
    await expect(page.locator("text=Failure Summary")).toBeVisible();
  });

  test("AX snapshot page shows accessibility tree", async ({ page }) => {
    await page.goto(`/scope/${FIXTURE_AUDIT_ID}/snapshots/page-001`);

    await expect(page.locator("h1")).toContainText("Accessibility Tree");
    await expect(page.locator("text=WebArea")).toBeVisible();
    await expect(page.locator("text=banner")).toBeVisible();
    await expect(page.locator("text=main")).toBeVisible();
  });

  test("filter bar narrows findings list", async ({ page }) => {
    await page.goto(`/scope/${FIXTURE_AUDIT_ID}/findings`);

    const criticalBtn = page.locator("button", { hasText: "Critical" });
    await criticalBtn.click();

    await expect(page.locator("text=1.4.3")).not.toBeVisible();
    await expect(page.locator("text=1.1.1")).toBeVisible();
  });

  test("evidence viewer accessible with alt text", async ({ page }) => {
    await page.goto(`/scope/${FIXTURE_AUDIT_ID}/findings`);

    const findingButton = page.locator("button", {
      hasText: "Elements must meet minimum color contrast ratio thresholds",
    });
    await findingButton.first().click();

    await expect(page.locator("text=Evidence")).toBeVisible();
  });

  test("WCAG criterion chip links to W3C", async ({ page }) => {
    await page.goto(`/scope/${FIXTURE_AUDIT_ID}/findings`);

    const chipLink = page.locator("a", { hasText: "1.4.3" });
    await expect(chipLink).toBeVisible();
    const href = await chipLink.getAttribute("href");
    expect(href).toContain("w3.org/WAI/WCAG22/Understanding/143");
  });
});
