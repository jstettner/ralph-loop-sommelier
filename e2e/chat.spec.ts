import { expect, test } from "@playwright/test";

test("AC-CHAT-1 AC-CHAT-2 AC-CHAT-3 AC-LLM-5 AC-SRCH-2 AC-JRNL-1 AC-JRNL-2 AC-REC-1 AC-REC-2 AC-REC-3 AC-REC-6 AC-MEM-4 AC-CURR-2 AC-CURR-3 AC-CURR-4 AC-UI-1 AC-UI-2 AC-UI-3 AC-UI-4 AC-UI-8 AC-UI-9 AC-UI-10 core journey", async ({ page }, testInfo) => {
  const email = `chat-${testInfo.project.name}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("EMAIL").fill(email);
  await page.getByLabel("PASSWORD").fill("correct-horse");
  await page.getByRole("button", { name: "CREATE HOUSEHOLD" }).click();
  await page.getByLabel("TASTER NAME").fill("Taylor");
  await page.getByRole("button", { name: "CREATE TASTER" }).click();
  await page.getByRole("button", { name: "I'LL FIGURE IT OUT AS I GO" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  expect(await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(5, 5, 5)");
  expect((await page.locator("body").evaluate((element) => getComputedStyle(element).fontFamily)).toLocaleLowerCase()).toContain("mono");
  await expect(page.getByTestId("scanlines")).toHaveCSS("pointer-events", "none");
  expect(parseFloat(await page.getByTestId("scanlines").evaluate((element) => getComputedStyle(element).borderTopLeftRadius))).toBeGreaterThan(0);
  const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewportWidth);
  if (testInfo.project.name === "mobile") {
    await expect(page.getByTestId("bottom-tabs")).toBeVisible();
    await expect(page.getByTestId("desktop-rail")).toBeHidden();
    await expect(page.getByTestId("bottom-tabs").getByRole("link")).toHaveCount(5);
    for (const link of await page.getByTestId("bottom-tabs").getByRole("link").all()) expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  } else {
    await expect(page.getByTestId("desktop-rail")).toBeVisible();
    await expect(page.getByTestId("bottom-tabs")).toBeHidden();
    await expect(page.getByTestId("desktop-rail").getByRole("navigation").getByRole("link")).toHaveCount(5);
  }

  await page.goto("/chat");
  await expect(page.locator('a[href="/chat"][aria-current="page"]:visible')).toBeVisible();
  await expect(page.locator('nav:visible svg[data-icon="Terminal"]')).toBeVisible();
  await expect(page.getByLabel("MODEL")).toHaveValue("mock:mock-model");
  await expect(page.getByLabel("MODEL")).toContainText("Mock Model");
  await expect(page.getByLabel("Taylor")).toBeChecked();
  await page.getByRole("button", { name: "START CHAT" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);
  await expect(page.getByText("MODEL: mock:mock-model")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });

  await page.getByRole("textbox", { name: "Message" }).fill("Teach me simply");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("▮")).toBeVisible();
  expect(parseFloat(await page.getByText("▮").evaluate((element) => getComputedStyle(element).animationDuration))).toBeLessThanOrEqual(0.001);
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
  expect((await page.getByRole("button", { name: "Send message" }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId("chat-transcript")).toHaveCSS("overflow-y", "auto");
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
  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:REC");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/saved a Mendoza Malbec/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:PROFILE");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/updated your palate profile/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.goto("/dashboard");
  const recommendationCards = page.locator("article").filter({ hasText: "Mendoza Malbec" });
  await expect(recommendationCards).toHaveCount(1);
  await expect(page.getByText("── FOR THE TABLE ──")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "SUGGEST A BOTTLE FOR ALL OF US" })).toHaveCount(0);
  await page.getByRole("button", { name: "SUGGEST MY NEXT BOTTLE" }).click();
  await expect(recommendationCards).toHaveCount(2);
  await recommendationCards.first().getByRole("button", { name: "dismissed" }).click();
  await expect(recommendationCards).toHaveCount(1);
  await page.goto("/journal");
  const card = page.getByTestId("journal-card");
  await expect(card).toContainText("Fixture Malbec");
  await expect(card).toContainText("Taylor");
  await expect(card).toContainText("liked");
  expect(await card.locator(".verdict-liked").evaluate((element) => getComputedStyle(element).color)).toBe("rgb(63, 185, 80)");
  await expect(card.getByLabel("4 out of 5")).toBeVisible();
  await card.getByRole("link", { name: /Fixture Malbec/ }).click();
  await expect(page.getByText("deep purple")).toBeVisible();
  await expect(page.getByText("blackberry · violet")).toBeVisible();
  await expect(page.getByText("Tasted by Taylor")).toBeVisible();
  await expect(page.getByRole("link", { name: "VIEW SOURCE CONVERSATION →" })).toBeVisible();
  await page.goto("/profile");
  await expect(page.getByText("Fixture Malbec", { exact: true })).toBeVisible();
  await expect(page.getByText("4 / 5").first()).toBeVisible();
  await expect(page.getByText(/Enjoys bold reds/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "DISLIKED" })).toBeVisible();

  await page.goto("/grapes");
  const grapeCards = page.locator("ol > li");
  await expect(grapeCards).toHaveCount(18);
  await expect(grapeCards.first()).toContainText("Sauvignon Blanc");
  await expect(grapeCards.last()).toContainText("Zinfandel");
  await expect(page.locator('a[href="/grapes/sauvignon-blanc"] svg')).toHaveAttribute("data-grape-appearance", "green-gold");
  await expect(page.locator('a[href="/grapes/cabernet-sauvignon"] svg')).toHaveAttribute("data-grape-appearance", "blue-purple");
  await expect(page.locator('a[href="/grapes/pinot-grigio"] svg')).toHaveAttribute("data-grape-appearance", "copper-pink");
  await expect(page.locator('a[href="/grapes/gewurztraminer"] svg')).toHaveAttribute("data-grape-appearance", "rose-pink");
  await grapeCards.first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: "Sauvignon Blanc" })).toBeVisible();
  await expect(page.locator('svg[data-icon="GrapeCluster"][data-grape-appearance="green-gold"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "── PROFILE ──" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "── CLASSIC REGIONS ──" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "── WHAT TO TASTE FOR ──" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "── BENCHMARK STYLES ──" })).toBeVisible();
  await page.getByRole("link", { name: /TASTE THIS GRAPE WITH ME/ }).click();
  await page.getByRole("button", { name: "START CHAT" }).click();
  await expect(page.getByText(/I want to taste Sauvignon Blanc/)).toBeVisible();
});

test("AC-CHAT-9 AC-SRCH-7 streamed tool lifecycle rows, safe summaries, and persisted citations", async ({ page }, testInfo) => {
  const email = `chat9-${testInfo.project.name}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("EMAIL").fill(email);
  await page.getByLabel("PASSWORD").fill("correct-horse");
  await page.getByRole("button", { name: "CREATE HOUSEHOLD" }).click();
  await page.getByLabel("TASTER NAME").fill("Robin");
  await page.getByRole("button", { name: "CREATE TASTER" }).click();
  await page.getByRole("button", { name: "I'LL FIGURE IT OUT AS I GO" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/chat");
  await page.getByRole("button", { name: "START CHAT" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);

  // ── AC-CHAT-9: progressive text + a tool row that runs then settles in place ──
  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:LIVE");
  await page.getByRole("button", { name: "Send message" }).click();
  const toolRow = page.getByTestId("tool-activity");
  await expect(toolRow).toHaveAttribute("data-tool-state", "running");
  // Partial assistant text is visible before the response completes; a duplicate send is blocked.
  await expect(page.getByText("Working on your tasting note")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
  // The same row updates in place to its terminal state with a friendly, safe summary.
  await expect(toolRow).toHaveAttribute("data-tool-state", "completed");
  await expect(toolRow).toContainText("Recorded tasting note");
  await expect(toolRow).toContainText("Fixture Malbec");
  await expect(toolRow).toContainText("Robin");
  await expect(toolRow).not.toContainText("taster_profile_id");
  await expect(toolRow).not.toContainText("{");
  await expect(page.getByText("Logged it — that Malbec is in your journal now.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  // Reload restores the terminal state and never replays the running animation.
  await page.reload();
  await expect(page.getByTestId("tool-activity")).toHaveAttribute("data-tool-state", "completed");
  await expect(page.getByTestId("tool-activity")).toContainText("Recorded tasting note");

  // ── AC-SRCH-7: safe citation links render from search results and survive reload ──
  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:SEARCH");
  await page.getByRole("button", { name: "Send message" }).click();
  const sourceLink = page.getByTestId("source-link").first();
  await expect(sourceLink).toBeVisible();
  await expect(sourceLink).toHaveAttribute("href", /^https:\/\//);
  await expect(sourceLink).not.toContainText("{");
  // Let the response finish (and persist) before reloading so the citation is restored from storage.
  await expect(page.getByText("Astor Wines appears in the availability results for Mendoza Malbec.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  await page.reload();
  await expect(page.getByTestId("source-link").first()).toBeVisible();
  await expect(page.getByTestId("source-link").first()).toHaveAttribute("href", /^https:\/\//);
});

test("AC-CHAT-10 AC-UI-12 neural trace streams reasoning, dissolves at the answer, and stays out of the a11y tree", async ({ page }, testInfo) => {
  const email = `chat10-${testInfo.project.name}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("EMAIL").fill(email);
  await page.getByLabel("PASSWORD").fill("correct-horse");
  await page.getByRole("button", { name: "CREATE HOUSEHOLD" }).click();
  await page.getByLabel("TASTER NAME").fill("Sky");
  await page.getByRole("button", { name: "CREATE TASTER" }).click();
  await page.getByRole("button", { name: "I'LL FIGURE IT OUT AS I GO" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/chat");
  await page.getByRole("button", { name: "START CHAT" }).click();
  await expect(page).toHaveURL(/\/chat\/[0-9a-f-]+$/);

  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:REASON");
  await page.getByRole("button", { name: "Send message" }).click();

  // Appears on the first reasoning delta with the provider-visible summary.
  const trace = page.getByTestId("neural-trace");
  await expect(trace).toBeVisible();
  await expect(trace).toContainText("NEURAL TRACE");
  await expect(trace).toContainText(/acidity and tannin history/i);

  // AC-UI-12: full-viewport, pointer-transparent, out of the a11y tree, 45–55% white/warm-white,
  // no opaque backdrop. Read all computed properties in one round-trip to stay within the window.
  await expect(trace).toHaveAttribute("aria-hidden", "true");
  const style = await trace.evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      pointerEvents: computed.pointerEvents, position: computed.position, opacity: parseFloat(computed.opacity),
      background: computed.backgroundColor, color: computed.color,
      width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
      vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight,
    };
  });
  expect(style.pointerEvents).toBe("none");
  expect(style.position).toBe("fixed");
  expect(style.opacity).toBeGreaterThanOrEqual(0.45);
  expect(style.opacity).toBeLessThanOrEqual(0.55);
  expect(style.background).toBe("rgba(0, 0, 0, 0)"); // no opaque backdrop
  const channels = (style.color.match(/\d+/g) ?? []).slice(0, 3).map(Number);
  expect(Math.min(...channels)).toBeGreaterThan(220); // white / warm-white
  expect(style.width).toBeGreaterThanOrEqual(style.vw - 1);
  expect(style.height).toBeGreaterThanOrEqual(style.vh - 1);

  // Interleaved tool activity shows in the trace before the answer takes over.
  await expect(trace).toContainText(/tasting note/i);

  // Dissolves when the final answer begins and unmounts; reasoning is not left in the transcript.
  await expect(page.getByText("I recorded that tasting after thinking through your acidity history.")).toBeVisible();
  await expect(page.getByTestId("neural-trace")).toBeHidden();
  await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();

  // Absent after reload — the trace never becomes permanent conversation content.
  await page.reload();
  await expect(page.getByText("I recorded that tasting after thinking through your acidity history.")).toBeVisible();
  await expect(page.getByTestId("neural-trace")).toBeHidden();

  // A no-reasoning turn fabricates no trace at all.
  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:TASTING");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("I recorded the 2022 Malbec for your tasting journal.")).toBeVisible();
  await expect(page.getByTestId("neural-trace")).toBeHidden();

  // Under reduced motion the trace is static (no animation) but still readable, and still unmounts.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("textbox", { name: "Message" }).fill("MOCK:REASON");
  await page.getByRole("button", { name: "Send message" }).click();
  const reduced = page.getByTestId("neural-trace");
  await expect(reduced).toBeVisible();
  await expect(reduced).toContainText(/acidity and tannin history/i);
  const reducedStyle = await reduced.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { animationDuration: parseFloat(computed.animationDuration), opacity: parseFloat(computed.opacity) };
  });
  expect(reducedStyle.animationDuration).toBeLessThanOrEqual(0.001);
  expect(reducedStyle.opacity).toBeGreaterThanOrEqual(0.45);
  expect(reducedStyle.opacity).toBeLessThanOrEqual(0.55);
  await expect(page.getByText("I recorded that tasting after thinking through your acidity history.")).toBeVisible();
  await expect(page.getByTestId("neural-trace")).toBeHidden();
});
