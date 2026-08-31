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
  readonly cacheLayer?: string;
}

interface InFlightEntry<TValue> {
  readonly controller: AbortController;
  readonly promise: Promise<TValue>;
  waiterCount: number;
  settled: boolean;
}

/** Combines bounded TTL caching with a bounded, self-cleaning single-flight registry. */
export class CachedLoader<TKey, TValue> {
  private readonly cache: BoundedTtlCache<TKey, TValue>;
  private readonly inFlight = new Map<TKey, InFlightEntry<TValue>>();
  private readonly maxInFlight: number;
  private readonly cacheLayer: string | undefined;

  constructor(
    private readonly source: DownstreamSource,
    options: CachedLoaderOptions,
  ) {
    this.cache = new BoundedTtlCache(options);
    this.maxInFlight = options.maxInFlight ?? options.maxEntries;
    this.cacheLayer = options.cacheLayer;
  }

  async load(
    key: TKey,
    context: OperationContext | undefined,
    factory: (context: OperationContext | undefined) => Promise<TValue>,
  ): Promise<TValue> {
    const cached = this.readCache(key);
    if (cached !== undefined) {
      context?.telemetry?.recordCache(this.source, "hit", this.getTelemetryDetails());
      return cached;
    }
    context?.telemetry?.recordCache(this.source, "miss", this.getTelemetryDetails());

    const existing = this.inFlight.get(key);
    if (existing !== undefined) {
      context?.telemetry?.recordSingleFlightJoin(this.source, this.getTelemetryDetails());
      return this.waitForEntry(key, existing, context);
    }

    if (this.inFlight.size >= this.maxInFlight) {
      const value = await factory(context);
      this.writeCache(key, value, context);
      return value;
    }

    const controller = new AbortController();
    const promise = Promise.resolve()
      .then(() => factory(createSharedOperationContext(context, controller.signal)))
      .then((value) => {
        if (!controller.signal.aborted) this.writeCache(key, value, context);
        return value;
      })
      .finally(() => {
        const current = this.inFlight.get(key);
        if (current?.controller === controller) {
          current.settled = true;
          this.inFlight.delete(key);
        }
      });
    const entry = { controller, promise, waiterCount: 0, settled: false };
    this.inFlight.set(key, entry);
    return this.waitForEntry(key, entry, context);
  }

  private waitForEntry(
    key: TKey,
    entry: InFlightEntry<TValue>,
    context: OperationContext | undefined,
  ): Promise<TValue> {
    entry.waiterCount += 1;

    return new Promise<TValue>((resolve, reject) => {
      let released = false;
      const signal = context?.signal;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      const release = (cancelled: boolean, reason?: unknown): void => {
        if (released) return;
        released = true;
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
        signal?.removeEventListener("abort", onAbort);
        entry.waiterCount -= 1;
        if (cancelled && entry.waiterCount === 0 && !entry.settled) {
          if (this.inFlight.get(key) === entry) this.inFlight.delete(key);
          entry.controller.abort(toAbortError(reason));
        }
      };
      const onAbort = (): void => {
        const error = toAbortError(signal?.reason as unknown);
        release(true, error);
        reject(error);
      };
      const onDeadline = (): void => {
        const error = new Error("Cached operation waiter deadline exceeded.");
        release(true, error);
        reject(error);
      };

      if (signal?.aborted === true) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      if (context?.deadlineAtMs !== undefined) {
        const remainingMs = context.deadlineAtMs - Date.now();
        if (remainingMs <= 0) {
          onDeadline();
          return;
        }
        deadlineTimer = setTimeout(onDeadline, remainingMs);
      }
      entry.promise.then(
        (value) => {
          release(false);
          resolve(value);
        },
        (error: unknown) => {
          release(false);
          reject(toAbortError(error));
        },
      );
    });
  }

  private readCache(key: TKey): TValue | undefined {
    try {
      return this.cache.get(key);
    } catch {
      return undefined;
    }
  }

  private getTelemetryDetails(): { readonly cacheLayer?: string } {
    return this.cacheLayer === undefined ? {} : { cacheLayer: this.cacheLayer };
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

/** Caller deadlines stay waiter-local; the factory receives only the aggregate cancellation signal. */
function createSharedOperationContext(
  context: OperationContext | undefined,
  signal: AbortSignal,
): OperationContext {
  if (context === undefined) return { signal };
  return {
    ...(context.requestId !== undefined ? { requestId: context.requestId } : {}),
    ...(context.tool !== undefined ? { tool: context.tool } : {}),
    ...(context.telemetry !== undefined ? { telemetry: context.telemetry } : {}),
    ...(context.logWriter !== undefined ? { logWriter: context.logWriter } : {}),
    signal,
  };
}

function toAbortError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("Cached operation waiter was aborted.");
}
