import { expect, test } from "@playwright/test";

test("AC-AUTH-1 AC-AUTH-2 AC-AUTH-4 AC-AUTH-5 AC-PROF-1 AC-PROF-2 AC-PROF-3 AC-MEM-1 AC-MEM-2 household and taster journey", async ({ page }, testInfo) => {
  const email = `journey-${testInfo.project.name}@example.test`;
  const password = "correct-horse";

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/signup");
  await page.getByLabel("EMAIL").fill(email);
  await page.getByLabel("PASSWORD").fill(password);
  await page.getByRole("button", { name: "CREATE HOUSEHOLD" }).click();
  await expect(page).toHaveURL(/\/profiles\/new$/);

  await page.getByLabel("TASTER NAME").fill("Alex");
  await page.getByRole("button", { name: "CREATE TASTER" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "I'LL FIGURE IT OUT AS I GO" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("── UP NEXT FOR ALEX ──")).toBeVisible();
  await page.reload();
  await expect(page.getByText("── UP NEXT FOR ALEX ──")).toBeVisible();

  await page.locator("button:visible", { hasText: "LOG OUT" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("EMAIL").fill(email);
  await page.getByLabel("PASSWORD").fill(password);
  await page.getByRole("button", { name: "LOG IN" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.locator('a[href="/profiles"]:visible').click();
  await expect(page).toHaveURL(/\/profiles$/);
  const alexColor = await page.getByRole("button", { name: /Alex/ }).evaluate((element) => getComputedStyle(element).color);
  await page.getByRole("link", { name: "+ NEW TASTER" }).click();
  await page.getByLabel("TASTER NAME").fill("Blair");
  await page.getByRole("button", { name: "CREATE TASTER" }).click();
  await page.getByLabel("Black", { exact: true }).check();
  await page.getByLabel("Grapefruit", { exact: true }).check();
  await page.getByLabel("Strong-steeped", { exact: true }).check();
  await page.getByLabel("Dark chocolate", { exact: true }).check();
  await page.getByLabel("Bold reds", { exact: true }).check();
  await page.getByRole("slider").fill("5");
  await page.getByRole("button", { name: "SAVE MY PALATE" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("── UP NEXT FOR BLAIR ──")).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByText("Onboarding interests: bold reds.")).toBeVisible();

  await page.locator('a[href="/profiles"]:visible').click();
  const blairColor = await page.getByRole("button", { name: /Blair/ }).evaluate((element) => getComputedStyle(element).color);
  expect(blairColor).not.toBe(alexColor);
  await page.getByRole("button", { name: /Alex/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.reload();
  await expect(page.getByText("── UP NEXT FOR ALEX ──")).toBeVisible();

  await page.locator("button:visible", { hasText: "LOG OUT" }).click();
  await page.getByLabel("EMAIL").fill(email);
  await page.getByLabel("PASSWORD").fill("wrong-password");
  await page.getByRole("button", { name: "LOG IN" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("PASSWORD").fill(password);
  await page.getByRole("button", { name: "LOG IN" }).click();
  await expect(page).toHaveURL(/\/profiles$/);
  await page.getByRole("button", { name: /Blair/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("── UP NEXT FOR BLAIR ──")).toBeVisible();

  await page.locator("button:visible", { hasText: "LOG OUT" }).click();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
});
