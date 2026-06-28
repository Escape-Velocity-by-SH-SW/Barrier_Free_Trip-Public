import { describe, expect, it, vi } from "vitest";

import { FetchHttpClient } from "./http-client.js";
import { HttpRequestError } from "./http-error.js";
import { buildUrl } from "./url.js";

describe("buildUrl", () => {
  it("builds a URL with encoded query parameters", () => {
    const url = buildUrl("https://example.test/api", "/items", {
      keyword: "경복궁",
      page: 1,
      empty: undefined,
      tags: ["a", "b"],
    });

    expect(url.toString()).toBe(
      "https://example.test/api/items?keyword=%EA%B2%BD%EB%B3%B5%EA%B6%81&page=1&tags=a&tags=b",
    );
  });
});

describe("FetchHttpClient", () => {
  it("returns parsed JSON for successful responses", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new FetchHttpClient({ baseUrl: "https://example.test", fetchFn });

    await expect(client.requestJson({ path: "/weather" })).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("classifies non-success HTTP status responses", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "nope" }), {
        status: 401,
      }),
    );
    const client = new FetchHttpClient({ baseUrl: "https://example.test", fetchFn });

    await expect(client.requestJson({ path: "/weather" })).rejects.toMatchObject({
      kind: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("classifies invalid JSON responses", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("not-json", {
        status: 200,
      }),
    );
    const client = new FetchHttpClient({ baseUrl: "https://example.test", fetchFn });

    await expect(client.requestJson({ path: "/weather" })).rejects.toMatchObject({
      kind: "INVALID_RESPONSE",
      status: 200,
    });
  });

  it("classifies network failures", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error("connection failed"));
    const client = new FetchHttpClient({ baseUrl: "https://example.test", fetchFn });

    await expect(client.requestJson({ path: "/weather" })).rejects.toBeInstanceOf(
      HttpRequestError,
    );
    await expect(client.requestJson({ path: "/weather" })).rejects.toMatchObject({
      kind: "NETWORK_ERROR",
    });
  });
});
