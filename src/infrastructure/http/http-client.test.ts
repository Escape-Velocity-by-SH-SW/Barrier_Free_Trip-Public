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

    await expect(client.requestJson({ path: "/weather" })).rejects.toBeInstanceOf(HttpRequestError);
    await expect(client.requestJson({ path: "/weather" })).rejects.toMatchObject({
      kind: "NETWORK_ERROR",
    });
  });

  it("does not classify caller cancellation as timeout when the timeout fires later", async () => {
    vi.useFakeTimers();

    try {
      const callerController = new AbortController();
      let rejectFetch: ((reason?: unknown) => void) | undefined;
      const fetchFn = vi.fn<typeof fetch>().mockImplementation(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectFetch = reject;
          }),
      );
      const client = new FetchHttpClient({ baseUrl: "https://example.test", fetchFn });

      const request = client.requestJson({
        path: "/weather",
        timeoutMs: 10,
        signal: callerController.signal,
      });

      callerController.abort(new Error("caller cancelled"));
      await vi.advanceTimersByTimeAsync(10);

      expect(rejectFetch).toBeDefined();

      if (rejectFetch === undefined) {
        throw new Error("fetch mock was not called.");
      }

      rejectFetch(new Error("caller cancelled"));

      await expect(request).rejects.toMatchObject({
        kind: "NETWORK_ERROR",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries one transient 503 response", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new FetchHttpClient({
      baseUrl: "https://example.test",
      fetchFn,
      maxRetries: 1,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 1,
    });

    await expect(client.requestJson({ path: "/weather" })).resolves.toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient 400 response", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad", { status: 400 }));
    const client = new FetchHttpClient({
      baseUrl: "https://example.test",
      fetchFn,
      maxRetries: 1,
    });

    await expect(client.requestJson({ path: "/weather" })).rejects.toMatchObject({ status: 400 });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("does not start a retry when the overall signal is already aborted", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(() => {
      controller.abort();
      return Promise.resolve(new Response("unavailable", { status: 503 }));
    });
    const client = new FetchHttpClient({
      baseUrl: "https://example.test",
      fetchFn,
      maxRetries: 1,
    });

    await expect(
      client.requestJson({ path: "/weather", context: { signal: controller.signal } }),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("does not ignore a Retry-After value longer than the bounded retry budget", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("busy", { status: 429, headers: { "retry-after": "10" } }));
    const client = new FetchHttpClient({
      baseUrl: "https://example.test",
      fetchFn,
      maxRetries: 1,
      retryMaxDelayMs: 200,
    });

    await expect(client.requestJson({ path: "/weather" })).rejects.toMatchObject({ status: 429 });
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
