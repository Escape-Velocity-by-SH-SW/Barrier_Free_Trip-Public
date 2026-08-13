import { randomUUID } from "node:crypto";

import type { OperationContext, RequestTelemetry } from "../ports/operation-context.js";
import {
  createStructuredLogEvent,
  toSafeErrorFields,
  type StructuredLogWriter,
  writeStructuredLog,
} from "./logging.js";
import { InMemoryRequestTelemetry } from "./request-telemetry.js";

export interface ToolSummaryDetails {
  readonly status?: string;
  readonly requestedCandidateCount?: number;
  readonly candidateCount?: number;
  readonly deduplicatedCandidateCount?: number;
  readonly destinationResolutionLatencyMs?: number;
  readonly partialResultCount?: number;
  readonly sourceStatuses?: Record<string, Record<string, number>>;
}

export interface ToolObservation {
  readonly context: OperationContext;
  readonly startedAt: number;
  summary(details: ToolSummaryDetails): void;
  error(error: unknown): void;
}

interface ToolObservationOptions {
  readonly requestId?: string;
  readonly log?: StructuredLogWriter;
  readonly now?: () => Date;
}

export function createToolObservation(
  tool: string,
  options: ToolObservationOptions = {},
): ToolObservation {
  const requestId = options.requestId ?? randomUUID();
  const log = options.log ?? writeStructuredLog;
  const now = options.now ?? (() => new Date());
  const telemetry = new InMemoryRequestTelemetry({ requestId, tool, log, now });
  const context: OperationContext = { requestId, tool, telemetry, logWriter: log };
  const startedAt = performance.now();

  log(createStructuredLogEvent("info", "tool.start", { requestId, tool }, now));

  return {
    context,
    startedAt,
    summary: (details) => writeToolSummary(context, startedAt, details, log, now),
    error: (error) => {
      log(
        createStructuredLogEvent(
          "error",
          "tool.error",
          {
            requestId,
            tool,
            durationMs: Math.round(performance.now() - startedAt),
            ...toSafeErrorFields(error),
          },
          now,
        ),
      );
    },
  };
}

/** Service에서 만든 상세 집계와 Tool 공통 카운터를 한 summary로 합친다. */
export function writeToolSummary(
  context: OperationContext,
  startedAt: number,
  details: ToolSummaryDetails,
  log: StructuredLogWriter = writeStructuredLog,
  now: () => Date = () => new Date(),
): void {
  const metrics = context.telemetry?.snapshot();
  log(
    createStructuredLogEvent(
      details.status === "FAILED" ? "error" : "info",
      "tool.summary",
      {
        ...(context.requestId !== undefined ? { requestId: context.requestId } : {}),
        ...(context.tool !== undefined ? { tool: context.tool } : {}),
        durationMs: Math.round(performance.now() - startedAt),
        ...details,
        ...(metrics !== undefined ? toSummaryMetrics(metrics) : {}),
      },
      now,
    ),
  );
}

export function ensureObservedContext(
  tool: string,
  context: OperationContext | undefined,
): OperationContext {
  if (context?.telemetry !== undefined) {
    return context;
  }

  const requestId = context?.requestId ?? randomUUID();
  return {
    ...context,
    requestId,
    tool: context?.tool ?? tool,
    telemetry: new InMemoryRequestTelemetry({
      requestId,
      tool: context?.tool ?? tool,
    }),
  };
}

function toSummaryMetrics(metrics: ReturnType<RequestTelemetry["snapshot"]>): object {
  return {
    cacheHit: metrics.cacheHits,
    cacheMiss: metrics.cacheMisses,
    singleFlightJoin: metrics.singleFlightJoins,
    downstreamCalls: metrics.downstreamCalls,
    retryCount: metrics.retries,
    timeoutCount: metrics.timeouts,
    downstream: metrics.downstream,
  };
}
