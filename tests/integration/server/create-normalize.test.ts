import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createLink } from "@/server/links/service";
import { createContext } from "@/server/trpc/context";
import { InputFieldError } from "@/server/trpc/errors";
import { testDb } from "../../support/db";
import { BASE_URL, callerFor, trpcHttp } from "../../support/trpc";
import { links } from "@/server/db/schema";

describe("links.create stores the normalized href", () => {
  it.each([
    ["https://example.com/ü", "https://example.com/%C3%BC"],
    ["https://bücher.example/", "https://xn--bcher-kva.example/"],
    ["https://example.com", "https://example.com/"],
  ])("%s -> %s", async (input, href) => {
    const link = await callerFor().links.create({ url: input });
    expect(link.targetUrl).toBe(href);
    const [row] = await testDb().select().from(links);
    expect(row.targetUrl).toBe(href);
  });

  it("rejects a target that is too long once normalized", async () => {
    const url = "https://example.com/" + "é".repeat(1000);
    const error = await callerFor()
      .links.create({ url })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "BAD_REQUEST" });
    expect((error as { cause: unknown }).cause).toBeInstanceOf(InputFieldError);
    expect((error as { cause: InputFieldError }).cause).toMatchObject({
      field: "url",
      message: "Links can be at most 2048 characters",
    });
    expect(await testDb().select().from(links)).toHaveLength(0);
  });

  it.each(["https://SHO.RT./x", "https://sho.rt:443/x", "https://sho.rt/x"])(
    "rejects %s as our own host with a url field error",
    async (url) => {
      const { status, body } = await trpcHttp("POST", "links.create", { url });
      expect(status).toBe(400);
      expect(body.error?.data.code).toBe("BAD_REQUEST");
      expect(body.error?.data.fieldErrors?.url).toHaveLength(1);
      expect(await testDb().select().from(links)).toHaveLength(0);
    },
  );

  it("rejects https://SHO.RT./x with the exact field message", async () => {
    const { body } = await trpcHttp("POST", "links.create", { url: "https://SHO.RT./x" });
    expect(body.error?.data.code).toBe("BAD_REQUEST");
    expect(body.error?.data.fieldErrors?.url).toEqual(["That's already a short link from this app"]);
  });

  it("createLink itself rejects our own host, without the router middleware", async () => {
    const ctx = createContext({ db: testDb(), env, baseUrl: BASE_URL });
    const error = await createLink(ctx, { url: "https://SHO.RT./x", expiry: { kind: "never" } }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ code: "BAD_REQUEST" });
    expect((error as { cause: unknown }).cause).toBeInstanceOf(InputFieldError);
    expect(await testDb().select().from(links)).toHaveLength(0);
  });
});
