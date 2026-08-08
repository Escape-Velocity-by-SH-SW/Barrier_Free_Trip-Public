import { describe, expect, it } from "vitest";

import { toSafeErrorFields, type StructuredLogEvent } from "./logging.js";
import { InMemoryRequestTelemetry } from "./request-telemetry.js";
import { createToolObservation } from "./tool-observation.js";
import { runWithDeadline } from "./deadline.js";
import { CachedLoader } from "../../infrastructure/cache/cached-loader.js";
import { FetchHttpClient } from "../../infrastructure/http/http-client.js";

describe("local observability", () => {
  it("keeps one requestId through cache, HTTP, retry, and summary logs", async () => {
    const events: StructuredLogEvent[] = [];
    const observation = createToolObservation("get_destination_weather", {
      requestId: "request-123",
      log: (event) => events.push(event),
    });
    const loader = new CachedLoader<string, string>("weather", {
      ttlMs: 1_000,
      maxEntries: 10,
    });
    let releaseFactory: ((value: string) => void) | undefined;
    const pending = new Promise<string>((resolve) => {
      releaseFactory = resolve;
    });

    const first = loader.load("same-key", observation.context, () => pending);
    const joined = loader.load("same-key", observation.context, () => Promise.resolve("unused"));
    releaseFactory?.("cached-value");
    await Promise.all([first, joined]);
    await loader.load("same-key", observation.context, () => Promise.resolve("unused"));

    let attempts = 0;
    const client = new FetchHttpClient({
      baseUrl: "https://example.test",
      source: "weather",
      maxRetries: 1,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 1,
      fetchFn: () => {
        attempts += 1;
        return Promise.resolve(
          attempts === 1
            ? new Response("{}", { status: 503 })
            : new Response("{}", { status: 200 }),
        );
      },
    });
    await client.requestJson({
      path: "/forecast",
      query: { serviceKey: "must-never-appear" },
      context: observation.context,
    });
    observation.summary({ status: "SUCCESS" });

    expect(events.map((event) => event.requestId)).toEqual(
      Array.from({ length: events.length }, () => "request-123"),
    );
    expect(events.map((event) => event.event)).toEqual(
      expect.arrayContaining([
        "tool.start",
        "cache.miss",
        "cache.hit",
        "singleflight.join",
        "downstream.call",
        "downstream.retry",
        "tool.summary",
      ]),
    );
    expect(JSON.stringify(events)).not.toContain("must-never-appear");
    expect(
      JSON.stringify(
        toSafeErrorFields(
          new Error(
            "request failed: https://example.test/path?serviceKey=must-never-appear Authorization=token",
          ),
        ),
      ),
    ).not.toContain("must-never-appear");

    const metrics = observation.context.telemetry?.snapshot();
    expect(metrics).toMatchObject({
      cacheHits: 1,
      cacheMisses: 2,
      singleFlightJoins: 1,
      downstreamCalls: 2,
      retries: 1,
      downstream: {
        weather: { calls: 2, retry: 1, timeout: 0 },
      },
    });
  });

  it("aggregates downstream calls, duration, retries, and timeouts by source", () => {
    const telemetry = new InMemoryRequestTelemetry({ log: () => undefined });
    telemetry.recordDownstreamCall("tourism", 100, "success");
    telemetry.recordDownstreamCall("tourism", 40, "failure");
    telemetry.recordDownstreamCall("festival", 250, "timeout");
    telemetry.recordRetry("tourism", 20);

    expect(telemetry.snapshot().downstream).toEqual({
      tourism: { calls: 2, durationMs: 140, retry: 1, timeout: 0 },
      festival: { calls: 1, durationMs: 250, retry: 0, timeout: 1 },
    });
  });

  it("records an exceeded overall deadline", async () => {
    const events: StructuredLogEvent[] = [];
    const observation = createToolObservation("get_destination_weather", {
      requestId: "deadline-request",
      log: (event) => events.push(event),
    });

    await runWithDeadline(
      5,
      (context) =>
        new Promise<void>((resolve) => {
          context.signal?.addEventListener("abort", () => resolve(), { once: true });
        }),
      observation.context,
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        event: "deadline.exceeded",
        requestId: "deadline-request",
      }),
    );
    expect(observation.context.telemetry?.snapshot().timeouts).toBe(1);
  });
});
