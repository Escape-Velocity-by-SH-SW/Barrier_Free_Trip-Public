import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { VisitAssessmentService } from "../dist/application/services/visit-assessment.service.js";
import { createServer } from "../dist/bootstrap/create-server.js";
import { FestivalApiClient } from "../dist/infrastructure/festival/festival-api.client.js";
import { FestivalAdapter } from "../dist/infrastructure/festival/festival.adapter.js";
import { registerAssessAccessibleVisitTool } from "../dist/mcp/tools/assess-accessible-visit.tool.js";

const destination = {
  name: "검증 관광지",
  contentId: "cold-first-call-fixture",
  contentTypeId: "12",
  address: "서울특별시 검증구",
  coordinates: { latitude: 37.5796, longitude: 126.977 },
};
const visitDate = "2026-08-20";
const defaultPerformanceOptions = {
  overallDeadlineMs: 200,
  destinationConcurrency: 1,
  responseReserveMs: 50,
  maxSourceBudgetMs: 100,
};

const acceptanceTests = [
  {
    name: "returns_widget_on_first_cold_call_with_all_sources_successful",
    run: () => verifyToolScenario({ expectedStatus: "SUCCESS" }),
  },
  {
    name: "returns_widget_on_first_cold_call_when_festival_is_slow",
    run: () =>
      verifyToolScenario({
        slowSources: ["festival"],
        expectedFailedSources: ["festival"],
      }),
  },
  {
    name: "returns_partial_widget_on_first_cold_call_when_weather_times_out",
    run: () =>
      verifyToolScenario({
        slowSources: ["weather"],
        expectedFailedSources: ["weather"],
      }),
  },
  {
    name: "returns_partial_widget_on_first_cold_call_when_weather_and_festival_time_out",
    run: () =>
      verifyToolScenario({
        slowSources: ["weather", "festival"],
        expectedFailedSources: ["weather", "festival"],
      }),
  },
  {
    name: "shrinks_source_budget_after_slow_destination_and_returns_first_call_widget",
    run: () =>
      verifyToolScenario({
        destinationDelayMs: 75,
        slowSources: ["weather"],
        expectedFailedSources: ["weather"],
        expectShrunkenBudget: true,
      }),
  },
  {
    name: "returns_partial_widget_on_first_cold_call_when_source_throws",
    run: () =>
      verifyToolScenario({
        throwingSources: ["festival"],
        expectedFailedSources: ["festival"],
      }),
  },
  {
    name: "does_not_require_warm_cache_for_widget_success",
    run: () => verifyToolScenario({ expectedStatus: "SUCCESS", assertColdFactories: true }),
  },
  {
    name: "festival_parent_abort_does_not_cache_incomplete_dataset",
    run: verifyFestivalParentAbortCleanup,
  },
  {
    name: "festival_cold_load_uses_single_flight_and_then_cache_hit",
    run: verifyFestivalSingleFlightAndCache,
  },
];

for (const test of acceptanceTests) {
  await test.run();
  process.stdout.write(`PASS ${test.name}\n`);
}

process.stdout.write(`Cold first-call Tool acceptance: PASS (${acceptanceTests.length} checks)\n`);

async function verifyToolScenario(options = {}) {
  const slowSources = new Set(options.slowSources ?? []);
  const throwingSources = new Set(options.throwingSources ?? []);
  const expectedFailedSources = new Set(options.expectedFailedSources ?? []);
  const callCounts = {
    destination: 0,
    accessibility: 0,
    weather: 0,
    charger: 0,
    festival: 0,
  };
  const services = createColdServices({
    callCounts,
    slowSources,
    throwingSources,
    destinationDelayMs: options.destinationDelayMs ?? 0,
  });
  const visitAssessmentService = new VisitAssessmentService(
    services.destinationResolver,
    services.accessibilityService,
    services.weatherService,
    services.chargerService,
    services.festivalRiskService,
    defaultPerformanceOptions,
  );

  if (options.assertColdFactories === true) {
    assert.deepEqual(Object.values(callCounts), [0, 0, 0, 0, 0]);
  }

  const { result, events, toolCallCount, elapsedMs } =
    await callAssessmentToolOnce(visitAssessmentService);
  const structured = validateWidgetToolResult(result);
  const expectedStatus = options.expectedStatus ?? "PARTIAL_SUCCESS";

  assert.equal(toolCallCount, 1, "acceptance must use exactly one tools/call");
  assert.equal(result.isError, undefined, "first tools/call must not be an error");
  assert.equal(structured.status, expectedStatus);
  assert.equal(
    structured.overallAssessment.status,
    expectedStatus === "SUCCESS" ? "LIKELY_ACCESSIBLE" : "CHECK_REQUIRED",
  );
  assert.equal(
    events.some((event) => event.event === "deadline.exceeded" && event.scope !== "source"),
    false,
    "the tool hard deadline must not be exceeded",
  );
  assert.ok(
    elapsedMs < defaultPerformanceOptions.overallDeadlineMs + 50,
    `first tools/call returned too late: ${elapsedMs}ms`,
  );

  for (const source of ["accessibility", "weather", "charger", "festival"]) {
    const sourceResult = getStructuredSource(structured, source);
    if (expectedFailedSources.has(source)) {
      assert.equal(sourceResult.status, "FAILED", `${source} must be represented as FAILED`);
      assert.ok(
        structured.combinedCautions.some((caution) =>
          caution.domains.includes(source.toUpperCase()),
        ),
        `${source} failure caution must remain in structuredContent`,
      );
      assert.ok(
        structured.unknowns.some((unknown) => unknown.includes(expectedUnknownLabel(source))),
        `${source} failure unknown must remain in structuredContent`,
      );
    } else {
      assert.notEqual(sourceResult.status, "FAILED", `${source} successful data must be retained`);
    }
  }

  for (const source of slowSources) {
    assert.ok(
      events.some(
        (event) =>
          event.event === "source.summary" &&
          event.source === source &&
          event.outcome === "TIMEOUT" &&
          event.timeout === true,
      ),
      `${source} must be cut off by its source soft deadline`,
    );
  }

  if (options.expectShrunkenBudget === true) {
    const sourceEvents = events.filter((event) => event.event === "source.summary");
    assert.equal(sourceEvents.length, 4);
    assert.ok(
      sourceEvents.every(
        (event) =>
          typeof event.budgetMs === "number" &&
          event.budgetMs > 0 &&
          event.budgetMs < defaultPerformanceOptions.maxSourceBudgetMs,
      ),
      "slow destination must reduce every source budget below the configured maximum",
    );
  }

  assert.equal(callCounts.destination, 1);
  for (const source of ["accessibility", "weather", "charger", "festival"]) {
    assert.equal(callCounts[source], 1, `${source} cold factory must run exactly once`);
  }
}

function createColdServices({ callCounts, slowSources, throwingSources, destinationDelayMs }) {
  const runSource = async (source, createResult) => {
    callCounts[source] += 1;
    if (throwingSources.has(source)) throw new Error(`${source} fixture failure`);
    if (slowSources.has(source)) return new Promise(() => undefined);
    return createResult();
  };

  return {
    destinationResolver: {
      resolve: async () => {
        callCounts.destination += 1;
        if (destinationDelayMs > 0) await delay(destinationDelayMs);
        return { status: "RESOLVED", destination };
      },
    },
    accessibilityService: {
      getAccessibility: () =>
        runSource("accessibility", () => ({
          status: "SUCCESS",
          destination,
          travelerType: "POWER_WHEELCHAIR",
          facilities: createFacilities(),
          cautions: [],
          unknowns: [],
        })),
    },
    weatherService: {
      getDestinationWeather: () =>
        runSource("weather", () => ({
          status: "AVAILABLE",
          destination,
          visitDate,
          travelerType: "POWER_WHEELCHAIR",
          forecasts: [
            {
              forecastDate: visitDate,
              minTemperatureCelsius: 20,
              maxTemperatureCelsius: 27,
              maxPrecipitationProbabilityPercent: 10,
              precipitationTypes: ["NONE"],
            },
          ],
          risk: { riskLevel: "LOW", riskTypes: [], cautions: [] },
        })),
    },
    chargerService: {
      findNearbyChargers: () =>
        runSource("charger", () => ({
          status: "SUCCESS",
          destination,
          radiusKm: 3,
          chargers: [],
          cautions: [],
        })),
    },
    festivalRiskService: {
      assess: () =>
        runSource("festival", () => ({
          status: "SUCCESS",
          destination,
          visitDate,
          radiusKm: 3,
          riskLevel: "LOW",
          festivals: [],
          cautions: [],
        })),
    },
  };
}

async function callAssessmentToolOnce(visitAssessmentService) {
  const server = createServer();
  registerAssessAccessibleVisitTool(server, {
    services: { visitAssessmentService },
  });
  const client = new Client(
    { name: "cold-first-call-verifier", version: "0.1.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const events = [];
  const originalConsoleError = console.error;
  let toolCallCount = 0;

  console.error = (...values) => {
    const event = parseStructuredLog(values[0]);
    if (event !== undefined) events.push(event);
  };

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const startedAt = performance.now();
    toolCallCount += 1;
    const result = await client.callTool({
      name: "assess_accessible_visit",
      arguments: {
        destination: destination.name,
        visitDate,
        travelerType: "POWER_WHEELCHAIR",
        radiusKm: 3,
        responseMode: "SUMMARY",
      },
    });
    return {
      result,
      events,
      toolCallCount,
      elapsedMs: performance.now() - startedAt,
    };
  } finally {
    console.error = originalConsoleError;
    await client.close();
  }
}

function validateWidgetToolResult(result) {
  assert.ok(Array.isArray(result.content) && result.content.length > 0);
  assert.equal(result.content[0].type, "text");
  assert.equal(typeof result.content[0].text, "string");

  const envelope = JSON.parse(result.content[0].text);
  assert.equal(typeof envelope, "object");
  assert.equal(envelope.widget?.type, "Card");
  assert.ok(Array.isArray(envelope.widget.children));
  assert.ok(envelope.widget.children.length > 0);
  assert.equal(Object.hasOwn(envelope.widget, "status"), false);
  assert.equal(typeof envelope.copy_text, "string");
  assert.ok(envelope.copy_text.trim().length > 0);

  assert.equal(typeof result.structuredContent, "object");
  assert.notEqual(result.structuredContent, null);
  return result.structuredContent;
}

function getStructuredSource(structured, source) {
  if (source === "charger") return structured.chargers;
  if (source === "festival") return structured.festivalRisk;
  return structured[source];
}

function expectedUnknownLabel(source) {
  const labels = {
    accessibility: "parking",
    weather: "날씨 정보",
    charger: "전동휠체어 충전소 정보",
    festival: "축제 기반 혼잡 위험 정보",
  };
  return labels[source];
}

function createFacilities() {
  return {
    parking: { status: "CONFIRMED" },
    route: { status: "CONFIRMED" },
    entrance: { status: "CONFIRMED" },
    elevator: { status: "CONFIRMED" },
    restroom: { status: "CONFIRMED" },
    wheelchairRental: { status: "CONFIRMED" },
    stroller: { status: "CONFIRMED" },
    lactationRoom: { status: "CONFIRMED" },
  };
}

async function verifyFestivalParentAbortCleanup() {
  let mode = "wait-for-abort";
  let httpCallCount = 0;
  const receivedContexts = [];
  const httpClient = {
    requestJson: ({ context }) => {
      httpCallCount += 1;
      receivedContexts.push(context);
      if (mode === "success") return Promise.resolve({ data: [], totalCount: 0 });
      return rejectWhenAborted(context?.signal);
    },
  };
  const apiClient = new FestivalApiClient(httpClient, {
    path: "/festival-fixture",
    fullScanPageSize: 1000,
  });
  const adapter = createFestivalAdapter(apiClient);
  const controller = new AbortController();
  const parentDeadlineAtMs = Date.now() + 5_000;
  const first = adapter.findNearby(festivalQuery(), {
    signal: controller.signal,
    deadlineAtMs: parentDeadlineAtMs,
  });

  await waitFor(() => httpCallCount === 1);
  assert.equal(receivedContexts[0].signal, controller.signal);
  assert.ok(receivedContexts[0].deadlineAtMs <= parentDeadlineAtMs);
  controller.abort(new Error("parent fixture abort"));
  await assert.rejects(first, /parent fixture abort/);

  mode = "success";
  const second = await adapter.findNearby(festivalQuery(), {});
  assert.deepEqual(second, []);
  assert.equal(httpCallCount, 2, "aborted incomplete dataset must not be cached or left in-flight");
}

async function verifyFestivalSingleFlightAndCache() {
  let apiCallCount = 0;
  let completeScan;
  const scanResult = new Promise((resolve) => {
    completeScan = resolve;
  });
  const adapter = createFestivalAdapter({
    getAllFestivals: () => {
      apiCallCount += 1;
      return scanResult;
    },
  });

  const first = adapter.findNearby(festivalQuery(), {});
  const joined = adapter.findNearby(festivalQuery(), {});
  await waitFor(() => apiCallCount === 1);
  assert.equal(apiCallCount, 1);
  completeScan({ data: [], totalCount: 0 });
  assert.deepEqual(await Promise.all([first, joined]), [[], []]);

  const cached = await adapter.findNearby(festivalQuery(), {});
  assert.deepEqual(cached, []);
  assert.equal(apiCallCount, 1, "completed cold load must be reused from cache");
}

function createFestivalAdapter(client) {
  return new FestivalAdapter(client, {
    dataset: { ttlMs: 60_000, maxEntries: 1 },
    dateIndex: { ttlMs: 60_000, maxEntries: 2 },
  });
}

function festivalQuery() {
  return {
    coordinates: destination.coordinates,
    visitDate,
    radiusKm: 3,
  };
}

function rejectWhenAborted(signal) {
  return new Promise((_resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason);
      return;
    }
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await delay(1);
  }
  throw new Error("Timed out waiting for deterministic fixture state.");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseStructuredLog(value) {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? parsed : undefined;
  } catch {
    return undefined;
  }
}
