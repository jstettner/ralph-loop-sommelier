import { expect, test } from "@playwright/test";

test("AC-CHAT-1 AC-CHAT-2 AC-CHAT-3 AC-LLM-5 AC-SRCH-2 AC-JRNL-1 AC-JRNL-2 persisted streaming mock chat", async ({ page }, testInfo) => {
  const email = `chat-${testInfo.project.name}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("EMAIL").fill(email);
  await page.getByLabel("PASSWORD").fill("correct-horse");
  await page.getByRole("button", { name: "CREATE HOUSEHOLD" }).click();
  await page.getByLabel("TASTER NAME").fill("Taylor");
  await page.getByRole("button", { name: "CREATE TASTER" }).click();
  await page.getByRole("button", { name: "I'LL FIGURE IT OUT AS I GO" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/chat");
  await expect(page.getByLabel("MODEL")).toHaveValue("mock:mock-model");
  await expect(page.getByLabel("MODEL")).toContainText("Mock Model");
  await expect(page.getByLabel("Taylor")).toBeChecked();
  await page.getByRole("button", { name: "START CHAT" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);
  await expect(page.getByText("MODEL: mock:mock-model")).toBeVisible();

  await page.getByRole("textbox", { name: "Message" }).fill("Teach me simply");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("▮")).toBeVisible();
  await expect(page.getByText("MOCK RESPONSE: Teach me simply")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();

  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:TASTING");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("I recorded the 2022 Malbec for your tasting journal.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  const conversationUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(conversationUrl);
  await expect(page.getByText("MOCK:TASTING", { exact: true })).toBeVisible();
  await expect(page.getByText("I recorded the 2022 Malbec for your tasting journal.")).toBeVisible();
  await expect(page.getByRole("main").getByText("Taylor", { exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:SEARCH");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Astor Wines appears/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.goto("/journal");
  const card = page.getByTestId("journal-card");
  await expect(card).toContainText("Fixture Malbec");
  await expect(card).toContainText("Taylor");
  await expect(card).toContainText("liked");
  await expect(card.getByLabel("4 out of 5")).toBeVisible();
  await card.getByRole("link", { name: /Fixture Malbec/ }).click();
  await expect(page.getByText("deep purple")).toBeVisible();
  await expect(page.getByText("blackberry · violet")).toBeVisible();
  await expect(page.getByText("Tasted by Taylor")).toBeVisible();
  await expect(page.getByRole("link", { name: "VIEW SOURCE CONVERSATION →" })).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByText("Fixture Malbec", { exact: true })).toBeVisible();
});
