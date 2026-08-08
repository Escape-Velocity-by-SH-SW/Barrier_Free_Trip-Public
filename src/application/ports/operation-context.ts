export type DownstreamSource = "tourism" | "accessibility" | "weather" | "charger" | "festival";

export interface RequestTelemetry {
  recordCache(source: DownstreamSource, result: "hit" | "miss"): void;
  recordSingleFlightJoin(source: DownstreamSource): void;
  recordDownstreamCall(
    source: DownstreamSource,
    durationMs: number,
    outcome: "success" | "failure" | "timeout",
  ): void;
  recordRetry(source: DownstreamSource): void;
}

export interface OperationContext {
  readonly signal?: AbortSignal;
  readonly telemetry?: RequestTelemetry;
  readonly deadlineAtMs?: number;
}
