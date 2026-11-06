import { describe, expect, it } from "vitest";
import { InputFieldError } from "@/server/trpc/errors";
import { testDb } from "../../support/db";
import { callerFor } from "../../support/trpc";
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
});
