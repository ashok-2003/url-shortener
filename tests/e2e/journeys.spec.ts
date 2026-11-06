import { expect, test, type Page } from "@playwright/test";

// The app has no sign-in gate: /sign-in is an optional page and the shell at "/" works
// straight away as the demo user. Home shows only the 5 newest links, so the seeded link
// is opened from the My links tab (/links), where every link is listed.

const rows = (page: Page) => page.getByRole("link", { name: /, opens details$/ });

test.describe("phone journeys", () => {
  test("create a link and copy it", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();

    await page.getByLabel("Link to shorten").fill(`https://example.com/e2e-${Date.now()}`);
    await page.getByRole("radio", { name: "24 hours" }).click();
    await page.getByRole("button", { name: "Shorten" }).click();

    const result = page.getByRole("status").filter({ hasText: "Link created" });
    await expect(result).toBeVisible();

    await result.getByRole("button", { name: "Copy" }).click();
    await expect(result.getByRole("button", { name: "Copied" })).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toMatch(/^http:\/\/localhost:8787\/[A-Za-z0-9]{7}$/);
    const slug = clipboard.split("/").pop()!;

    // Newest first: the new link is the first row under "Recent links".
    await expect(rows(page).first()).toContainText(slug);
    await expect(page.getByLabel("Link to shorten")).toHaveValue("");
    await expect(page.getByRole("radio", { name: "24 hours" })).toBeChecked();
  });

  test("a non-https link is refused", async ({ page }) => {
    await page.goto("/");
    const before = await rows(page).count();

    await page.getByLabel("Link to shorten").fill("http://example.com");
    await page.getByRole("button", { name: "Shorten" }).click();

    await expect(page.getByText("Use an https:// link")).toBeVisible();
    await expect(rows(page)).toHaveCount(before);
  });

  test("details sheet survives reload and closes on back", async ({ page }) => {
    await page.goto("/links");
    await expect(page.getByRole("heading", { level: 1, name: "My links" })).toBeVisible();

    await page.getByRole("link", { name: /^e2eSeed, .*opens details$/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveURL(/link=e2eSeed/);

    await page.reload();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.goBack();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(page.url()).not.toContain("link=");
  });

  test("a visit redirects and is counted", async ({ page, request }) => {
    const res = await request.get("/e2eSeed", { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers()["location"]).toBe("https://example.com/seeded");

    await page.goto("/?link=e2eSeed");
    const dialog = page.getByRole("dialog");
    const allClicks = dialog.getByText("All clicks").locator("xpath=following-sibling::dd[1]");
    // Counting is asynchronous (queue + consumer): reload between polls.
    await expect(async () => {
      await page.reload();
      await expect(allClicks).toHaveText("1", { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  });
});
