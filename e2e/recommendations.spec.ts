import { expect, test } from "@playwright/test";

test("AC-REC-7 AC-REC-8 dashboard generation streams a neural trace and persists distinct alternatives without reload", async ({ page }, testInfo) => {
  await page.goto("/signup");
  await page.getByLabel("EMAIL").fill(`rec7-${testInfo.project.name}@example.test`);
  await page.getByLabel("PASSWORD").fill("correct-horse");
  await page.getByRole("button", { name: "CREATE HOUSEHOLD" }).click();
  await page.getByLabel("TASTER NAME").fill("Alex");
  await page.getByRole("button", { name: "CREATE TASTER" }).click();
  await page.getByRole("button", { name: "I'LL FIGURE IT OUT AS I GO" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/profiles/new");
  await page.getByLabel("TASTER NAME").fill("Sam");
  await page.getByRole("button", { name: "CREATE TASTER" }).click();
  await page.getByRole("button", { name: "I'LL FIGURE IT OUT AS I GO" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // ── Profile mode: overlay streams safe tool state, then the card appears without a reload ──
  const url = page.url();
  await page.getByRole("button", { name: "SUGGEST MY NEXT BOTTLE" }).click();
  const trace = page.getByTestId("neural-trace");
  await expect(trace).toBeVisible();
  await expect(trace).toContainText("NEURAL TRACE");
  await expect(trace).toContainText(/Saving recommendation/i);
  await expect(trace).toHaveAttribute("aria-hidden", "true");
  const upNext = page.locator("section").filter({ hasText: /── UP NEXT FOR/ });
  await expect(upNext).toContainText("Mendoza Malbec");
  expect(page.url()).toBe(url); // rendered via refresh, not a navigation/reload
  await expect(page.getByTestId("neural-trace")).toBeHidden(); // dissolves on completion

  // ── Repeating generation sees the first pick and saves a useful alternative ──
  await page.getByRole("button", { name: "SUGGEST MY NEXT BOTTLE" }).click();
  await expect(page.getByTestId("neural-trace")).toBeVisible();
  await expect(page.getByTestId("neural-trace")).toBeHidden();
  await expect(upNext.locator("article").filter({ hasText: "Mendoza Malbec" })).toHaveCount(1);
  await expect(upNext.locator("article").filter({ hasText: "Etna Rosso" })).toHaveCount(1);
  await expect(upNext.locator("article")).toHaveCount(2);

  // ── Joint mode: same overlay behaviour, new "for the table" card without reload ──
  await page.getByRole("button", { name: "SUGGEST A BOTTLE FOR ALL OF US" }).click();
  const jointTrace = page.getByTestId("neural-trace");
  await expect(jointTrace).toBeVisible();
  await expect(jointTrace).toContainText(/Saving recommendation/i);
  const table = page.locator("section").filter({ hasText: "── FOR THE TABLE ──" });
  await expect(table).toContainText("Cru Beaujolais");
  await expect(page.getByTestId("neural-trace")).toBeHidden();

  // ── Joint generation also receives the household-wide catalog ──
  await page.getByRole("button", { name: "SUGGEST A BOTTLE FOR ALL OF US" }).click();
  await expect(page.getByTestId("neural-trace")).toBeVisible();
  await expect(page.getByTestId("neural-trace")).toBeHidden();
  await expect(table.locator("article").filter({ hasText: "Cru Beaujolais" })).toHaveCount(1);
  await expect(table.locator("article").filter({ hasText: "Rioja Reserva" })).toHaveCount(1);
  await expect(table.locator("article")).toHaveCount(2);
});
