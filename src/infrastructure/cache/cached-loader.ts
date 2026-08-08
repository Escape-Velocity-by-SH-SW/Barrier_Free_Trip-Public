import type {
  DownstreamSource,
  OperationContext,
} from "../../application/ports/operation-context.js";
import { BoundedTtlCache, type BoundedTtlCacheOptions } from "./bounded-ttl-cache.js";
import {
  createStructuredLogEvent,
  toSafeErrorFields,
  writeStructuredLog,
} from "../../application/services/logging.js";

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
        this.writeCache(key, value, context);
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

  private writeCache(key: TKey, value: TValue, context: OperationContext | undefined): void {
    try {
      this.cache.set(key, value);
    } catch (error) {
      writeStructuredLog(
        createStructuredLogEvent("error", "cache.error", {
          ...(context?.requestId !== undefined ? { requestId: context.requestId } : {}),
          ...(context?.tool !== undefined ? { tool: context.tool } : {}),
          source: this.source,
          ...toSafeErrorFields(error),
        }),
      );
    }
  }
}
