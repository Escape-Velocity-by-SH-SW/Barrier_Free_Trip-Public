import type { DownstreamSource, RequestTelemetry } from "../ports/operation-context.js";

export interface RequestTelemetrySnapshot {
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly singleFlightJoins: number;
  readonly downstreamCalls: number;
  readonly retries: number;
  readonly timeouts: number;
  readonly apiLatencyMs: Partial<Record<DownstreamSource, number>>;
}

export class InMemoryRequestTelemetry implements RequestTelemetry {
  private cacheHits = 0;
  private cacheMisses = 0;
  private singleFlightJoins = 0;
  private downstreamCalls = 0;
  private retries = 0;
  private timeouts = 0;
  private readonly apiLatencyMs: Partial<Record<DownstreamSource, number>> = {};

  recordCache(source: DownstreamSource, result: "hit" | "miss"): void {
    void source;
    if (result === "hit") {
      this.cacheHits += 1;
    } else {
      this.cacheMisses += 1;
    }
  }

  recordSingleFlightJoin(source: DownstreamSource): void {
    void source;
    this.singleFlightJoins += 1;
  }

  recordDownstreamCall(
    source: DownstreamSource,
    durationMs: number,
    outcome: "success" | "failure" | "timeout",
  ): void {
    this.downstreamCalls += 1;
    this.apiLatencyMs[source] = (this.apiLatencyMs[source] ?? 0) + durationMs;
    if (outcome === "timeout") {
      this.timeouts += 1;
    }
  }

  recordRetry(source: DownstreamSource): void {
    void source;
    this.retries += 1;
  }

  recordTimeout(): void {
    this.timeouts += 1;
  }

  snapshot(): RequestTelemetrySnapshot {
    return {
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      singleFlightJoins: this.singleFlightJoins,
      downstreamCalls: this.downstreamCalls,
      retries: this.retries,
      timeouts: this.timeouts,
      apiLatencyMs: { ...this.apiLatencyMs },
    };
  }
}
