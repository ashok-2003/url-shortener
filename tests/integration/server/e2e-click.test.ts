import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { handleClickBatch } from "@/server/clicks/consumer";
import { capturingQueue, runRedirect } from "../../support/redirect";
import { trpcHttp } from "../../support/trpc";
import { fakeBatch } from "./fake-batch";

describe("create -> redirect -> queue -> stats", () => {
  it("counts one click once, even when the batch is redelivered", async () => {
    const created = await trpcHttp("POST", "links.create", {
      url: "https://example.com/e2e",
    });
    expect(created.status).toBe(200);
    const slug = (created.body.result!.data as { slug: string }).slug;

    const queue = capturingQueue("real");
    const { response, settle } = await runRedirect(`/${slug}`, {
      env: queue.env,
      headers: {
        referer: "https://news.example.org/story",
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      },
      cf: { country: "IN" },
    });
    expect(response.status).toBe(302);
    await settle();
    expect(queue.sent).toHaveLength(1);

    const run = async () => {
      const { batch, messages } = fakeBatch(queue.sent);
      await handleClickBatch(batch, env);
      expect(messages).toHaveLength(1);
      for (const m of messages) expect(m.retry).not.toHaveBeenCalled();
    };
    await run();
    const stats = await trpcHttp("GET", "links.stats", { slug });
    const data = stats.body.result!.data as {
      totals: { all: number };
      lastClickAt: unknown;
      referrers: { host: string | null; clicks: number }[];
      countries: { country: string | null; clicks: number }[];
      devices: { deviceType: string; clicks: number }[];
    };
    expect(data.totals.all).toBe(1);
    expect(data.lastClickAt).not.toBeNull();
    expect(data.referrers).toEqual([{ host: "news.example.org", clicks: 1 }]);
    expect(data.countries).toEqual([{ country: "IN", clicks: 1 }]);
    expect(data.devices).toEqual([{ deviceType: "mobile", clicks: 1 }]);

    await run(); // redelivery
    const again = await trpcHttp("GET", "links.stats", { slug });
    expect(
      (again.body.result!.data as { totals: { all: number } }).totals.all,
    ).toBe(1);
  });
});
