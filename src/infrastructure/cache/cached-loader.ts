import type {
  DownstreamSource,
  OperationContext,
} from "../../application/ports/operation-context.js";
import { BoundedTtlCache, type BoundedTtlCacheOptions } from "./bounded-ttl-cache.js";

export interface CachedLoaderOptions extends BoundedTtlCacheOptions {
  readonly maxInFlight?: number;
}

/** Combines bounded TTL caching with a bounded, self-cleaning single-flight registry. */
export class CachedLoader<TKey, TValue> {
  private readonly cache: BoundedTtlCache<TKey, TValue>;
  private readonly inFlight = new Map<TKey, Promise<TValue>>();
  private readonly maxInFlight: number;

  constructor(
    private readonly source: DownstreamSource,
    options: CachedLoaderOptions,
  ) {
    this.cache = new BoundedTtlCache(options);
    this.maxInFlight = options.maxInFlight ?? options.maxEntries;
  }

  async load(
    key: TKey,
    context: OperationContext | undefined,
    factory: () => Promise<TValue>,
  ): Promise<TValue> {
    const cached = this.readCache(key);
    if (cached !== undefined) {
      context?.telemetry?.recordCache(this.source, "hit");
      return cached;
    }
    context?.telemetry?.recordCache(this.source, "miss");

    const existing = this.inFlight.get(key);
    if (existing !== undefined) {
      context?.telemetry?.recordSingleFlightJoin(this.source);
      return existing;
    }

    if (this.inFlight.size >= this.maxInFlight) {
      return factory();
    }

    const promise = factory()
      .then((value) => {
        this.writeCache(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  private readCache(key: TKey): TValue | undefined {
    try {
      return this.cache.get(key);
    } catch {
      return undefined;
    }
  }

  private writeCache(key: TKey, value: TValue): void {
    try {
      this.cache.set(key, value);
    } catch (error) {
      console.error("[cache] failed to store best-effort cache entry", {
        source: this.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
