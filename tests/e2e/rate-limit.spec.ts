import { expect, test } from "@playwright/test";

// PENDING(E): the owner's limiter (spec §9)
test.describe.skip("create rate limit", () => {
  test("blocks the sixth create and counts down", async ({ page }) => {
    await page.goto("/");
    const shorten = page.getByRole("button", { name: "Shorten" });
    const limited = page.getByRole("status").filter({ hasText: /Try again in/ });
    const created = page.getByRole("status").filter({ hasText: "Link created" });

    for (let attempt = 0; attempt < 6 && !(await limited.isVisible()); attempt++) {
      await page.getByLabel("Link to shorten").fill(`https://example.com/rl-${Date.now()}-${attempt}`);
      await shorten.click();
      await expect(limited.or(created)).toBeVisible();
    }

    await expect(limited).toBeVisible();
    const seconds = async () =>
      Number(/Try again in (\d+) s/.exec((await limited.textContent()) ?? "")?.[1]);
    const first = await seconds();
    expect(first).toBeGreaterThan(0);
    await expect.poll(seconds, { timeout: 2_500 }).toBeLessThan(first);
    await expect(shorten).toBeDisabled();
  });
});
