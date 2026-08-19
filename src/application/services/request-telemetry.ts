import { randomUUID } from "node:crypto";

import type {
  CacheTelemetryDetails,
  DeadlineTelemetryDetails,
  DownstreamSource,
  DownstreamTelemetrySnapshot,
  RequestTelemetry,
  RequestTelemetrySnapshot,
} from "../ports/operation-context.js";
import {
  createStructuredLogEvent,
  type StructuredLogWriter,
  writeStructuredLog,
} from "./logging.js";

export interface InMemoryRequestTelemetryOptions {
  readonly requestId?: string;
  readonly tool?: string;
  readonly log?: StructuredLogWriter;
  readonly now?: () => Date;
}

export class InMemoryRequestTelemetry implements RequestTelemetry {
  readonly requestId: string;
  readonly tool: string;
  private cacheHits = 0;
  private cacheMisses = 0;
  private singleFlightJoins = 0;
  private downstreamCalls = 0;
  private retries = 0;
  private timeouts = 0;
  private readonly apiLatencyMs: Partial<Record<DownstreamSource, number>> = {};
  private readonly downstream: Partial<Record<DownstreamSource, DownstreamTelemetrySnapshot>> = {};
  private readonly log: StructuredLogWriter;
  private readonly now: () => Date;

  constructor(options: InMemoryRequestTelemetryOptions = {}) {
    this.requestId = options.requestId ?? randomUUID();
    this.tool = options.tool ?? "unknown";
    this.log = options.log ?? writeStructuredLog;
    this.now = options.now ?? (() => new Date());
  }

  recordCache(
    source: DownstreamSource,
    result: "hit" | "miss",
    details: CacheTelemetryDetails = {},
  ): void {
    if (result === "hit") {
      this.cacheHits += 1;
    } else {
      this.cacheMisses += 1;
    }
    this.emit("info", result === "hit" ? "cache.hit" : "cache.miss", {
      source,
      ...details,
    });
  }

  recordSingleFlightJoin(source: DownstreamSource, details: CacheTelemetryDetails = {}): void {
    this.singleFlightJoins += 1;
    this.emit("info", "singleflight.join", { source, ...details });
  }

  recordDownstreamCall(
    source: DownstreamSource,
    durationMs: number,
    outcome: "success" | "failure" | "timeout",
  ): void {
    this.downstreamCalls += 1;
    this.apiLatencyMs[source] = (this.apiLatencyMs[source] ?? 0) + durationMs;
    const sourceMetrics = this.getSourceMetrics(source);
    this.downstream[source] = {
      ...sourceMetrics,
      calls: sourceMetrics.calls + 1,
      durationMs: sourceMetrics.durationMs + durationMs,
      timeout: sourceMetrics.timeout + (outcome === "timeout" ? 1 : 0),
    };
    if (outcome === "timeout") {
      this.timeouts += 1;
    }
    this.emit(outcome === "success" ? "info" : "error", "downstream.call", {
      source,
      durationMs,
      outcome,
    });
  }

  recordRetry(source: DownstreamSource, delayMs?: number): void {
    this.retries += 1;
    const sourceMetrics = this.getSourceMetrics(source);
    this.downstream[source] = {
      ...sourceMetrics,
      retry: sourceMetrics.retry + 1,
    };
    this.emit("warn", "downstream.retry", {
      source,
      ...(delayMs !== undefined ? { delayMs } : {}),
    });
  }

  recordDeadlineExceeded(details: DeadlineTelemetryDetails = {}): void {
    this.timeouts += 1;
    this.emit("error", "deadline.exceeded", { ...details });
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
      downstream: Object.fromEntries(
        Object.entries(this.downstream).map(([source, metrics]) => [source, { ...metrics }]),
      ),
    };
  }

  private getSourceMetrics(source: DownstreamSource): DownstreamTelemetrySnapshot {
    return (
      this.downstream[source] ?? {
        calls: 0,
        durationMs: 0,
        retry: 0,
        timeout: 0,
      }
    );
  }

  private emit(
    level: "info" | "warn" | "error",
    event: string,
    fields: Record<string, unknown>,
  ): void {
    this.log(
      createStructuredLogEvent(
        level,
        event,
        {
          requestId: this.requestId,
          tool: this.tool,
          ...fields,
        },
        this.now,
      ),
    );
  }
}
