import { describe, expect, it, vi } from "vitest";

import { BoundedTtlCache } from "./bounded-ttl-cache.js";
import { CachedLoader } from "./cached-loader.js";

describe("BoundedTtlCache", () => {
  it("supports miss, hit, TTL expiry, and LRU eviction", () => {
    let now = 0;
    const cache = new BoundedTtlCache<string, number>({
      ttlMs: 100,
      maxEntries: 2,
      clock: () => now,
    });

    expect(cache.get("missing")).toBeUndefined();
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.size).toBe(2);

    now = 101;
    expect(cache.get("a")).toBeUndefined();
  });
});

describe("CachedLoader", () => {
  it("shares one in-flight lookup across ten concurrent misses and then serves cache", async () => {
    let resolveFactory: ((value: string) => void) | undefined;
    const factory = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveFactory = resolve;
        }),
    );
    const loader = new CachedLoader<string, string>("tourism", {
      ttlMs: 1_000,
      maxEntries: 10,
    });

    const requests = Array.from({ length: 10 }, () => loader.load("경복궁", undefined, factory));
    expect(factory).toHaveBeenCalledOnce();
    resolveFactory?.("resolved");
    await expect(Promise.all(requests)).resolves.toEqual(Array(10).fill("resolved"));
    await expect(loader.load("경복궁", undefined, factory)).resolves.toBe("resolved");
    expect(factory).toHaveBeenCalledOnce();
  });

  it("removes a rejected in-flight entry so the next request can recover", async () => {
    const loader = new CachedLoader<string, string>("tourism", {
      ttlMs: 1_000,
      maxEntries: 10,
    });
    const factory = vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValue("ok");

    await expect(loader.load("key", undefined, factory)).rejects.toThrow("temporary");
    await expect(loader.load("key", undefined, factory)).resolves.toBe("ok");
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
