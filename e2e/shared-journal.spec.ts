import { expect, test } from "@playwright/test";

test("AC-CHAT-7 AC-CHAT-8 AC-JRNL-5 AC-REC-5 shared tasting groups two attributed scores and a joint pick", async ({ page }, testInfo) => {
  await page.goto("/signup");
  await page.getByLabel("EMAIL").fill(`shared-${testInfo.project.name}@example.test`);
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

  await page.goto("/chat");
  await expect(page.getByLabel("Sam")).toBeChecked();
  await expect(page.getByLabel("Alex")).not.toBeChecked();
  await page.getByLabel("Alex").check();
  await page.getByRole("button", { name: "START CHAT" }).click();
  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:SHARED");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/separate notes for both tasters/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:JOINTREC");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/saved a bottle for both of you/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();

  await page.goto("/dashboard");
  const tableSection = page.locator("section").filter({ hasText: "── FOR THE TABLE ──" });
  await expect(tableSection).toContainText("Cru Beaujolais");
  const upNextSection = page.locator("section").filter({ hasText: /── UP NEXT FOR/ });
  await expect(upNextSection).not.toContainText("Cru Beaujolais");

  await page.goto("/journal");
  await expect(page.getByTestId("journal-card")).toHaveCount(1);
  const card = page.getByTestId("journal-card");
  await expect(card).toContainText("Alex");
  await expect(card).toContainText("Sam");
  await expect(card.getByLabel("4 out of 5")).toBeVisible();
  await expect(card.getByLabel("2 out of 5")).toBeVisible();
});
