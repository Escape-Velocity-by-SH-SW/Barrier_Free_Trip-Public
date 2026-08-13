export interface BoundedTtlCacheOptions {
  readonly ttlMs: number;
  readonly maxEntries: number;
  readonly clock?: () => number;
}

interface CacheEntry<TValue> {
  readonly value: TValue;
  readonly expiresAt: number;
}

/** Process-local best-effort LRU cache. Correctness never depends on retained entries. */
export class BoundedTtlCache<TKey, TValue> {
  private readonly entries = new Map<TKey, CacheEntry<TValue>>();
  private readonly clock: () => number;

  constructor(private readonly options: BoundedTtlCacheOptions) {
    if (
      !Number.isFinite(options.ttlMs) ||
      options.ttlMs <= 0 ||
      !Number.isSafeInteger(options.maxEntries) ||
      options.maxEntries <= 0
    ) {
      throw new Error(
        "Cache ttlMs must be finite and positive; maxEntries must be a positive safe integer.",
      );
    }
    this.clock = options.clock ?? Date.now;
  }

  get(key: TKey): TValue | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }

    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: TKey, value: TValue): void {
    this.entries.delete(key);
    this.entries.set(key, {
      value,
      expiresAt: this.clock() + this.options.ttlMs,
    });

    while (this.entries.size > this.options.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) {
        return;
      }
      this.entries.delete(oldestKey);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
