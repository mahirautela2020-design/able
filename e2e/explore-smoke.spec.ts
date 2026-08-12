import { test, expect } from "@playwright/test";

const AUDIT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

test.describe("P1 — Explore workbench smoke", () => {
  test("View/Explore toggle switches between findings list and explore panel", async ({
    page,
  }) => {
    await page.goto(`/scope/${AUDIT_ID}/explore`);

    // View mode renders the findings list.
    await expect(page.locator("h1")).toContainText("Findings");

    // Toggle to Explore mode.
    await page.getByRole("tab", { name: "Explore" }).click();

    // Explore panel sections render.
    await expect(page.getByText("Element Inspector", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Live contrast" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Accessibility tree" })).toBeVisible();
    await expect(page.locator("iframe[title='Explore preview']")).toBeVisible();
  });

  test("keyboard replay scans focusables from the fixture", async ({ page }) => {
    await page.goto(`/scope/${AUDIT_ID}/explore`);
    await page.getByRole("tab", { name: "Explore" }).click();

    await page.getByText("Scan focusables").click();
    await expect(page.getByTestId("keyboard-steps")).toBeVisible();
    await expect(page.getByTestId("keyboard-step-0")).toBeVisible();
  });

  test("color-blind simulation select works and shows the honest disclaimer", async ({
    page,
  }) => {
    await page.goto(`/scope/${AUDIT_ID}/explore`);
    await page.getByRole("tab", { name: "Explore" }).click();

    await page.getByTestId("cvd-select").selectOption("deuteranopia");
    await expect(page.getByText(/Simulated — verify with real users/)).toBeVisible();
  });
});
