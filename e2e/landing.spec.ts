import { expect, test } from "@playwright/test";

test("built application serves the household entry page", async ({ request }) => {
  const response = await request.get("/");
  expect(response.ok()).toBe(true);
  expect(await response.text()).toContain("WINE TRAINER");
});
