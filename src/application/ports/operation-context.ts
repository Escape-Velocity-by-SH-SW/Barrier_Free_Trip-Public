export type DownstreamSource = "tourism" | "accessibility" | "weather" | "charger" | "festival";

export interface CacheTelemetryDetails {
  readonly cacheLayer?: string;
}

export interface DeadlineTelemetryDetails {
  readonly scope?: "tool" | "source";
  readonly source?: DownstreamSource;
}

export interface DownstreamTelemetrySnapshot {
  readonly calls: number;
  readonly durationMs: number;
  readonly retry: number;
  readonly timeout: number;
}

export interface RequestTelemetrySnapshot {
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly singleFlightJoins: number;
  readonly downstreamCalls: number;
  readonly retries: number;
  readonly timeouts: number;
  readonly apiLatencyMs: Partial<Record<DownstreamSource, number>>;
  readonly downstream: Partial<Record<DownstreamSource, DownstreamTelemetrySnapshot>>;
}

export interface RequestTelemetry {
  recordCache(
    source: DownstreamSource,
    result: "hit" | "miss",
    details?: CacheTelemetryDetails,
  ): void;
  recordSingleFlightJoin(source: DownstreamSource, details?: CacheTelemetryDetails): void;
  recordDownstreamCall(
    source: DownstreamSource,
    durationMs: number,
    outcome: "success" | "failure" | "timeout",
  ): void;
  recordRetry(source: DownstreamSource, delayMs?: number): void;
  recordDeadlineExceeded(details?: DeadlineTelemetryDetails): void;
  snapshot(): RequestTelemetrySnapshot;
}

export interface OperationContext {
  readonly requestId?: string;
  readonly tool?: string;
  readonly signal?: AbortSignal;
  readonly telemetry?: RequestTelemetry;
  readonly deadlineAtMs?: number;
  readonly logWriter?: (event: {
    readonly timestamp: string;
    readonly level: "info" | "warn" | "error";
    readonly event: string;
    readonly [key: string]: unknown;
  }) => void;
}
