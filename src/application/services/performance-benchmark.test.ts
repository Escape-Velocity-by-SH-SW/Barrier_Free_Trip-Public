import { describe, expect, it } from "vitest";

import { CachedLoader } from "../../infrastructure/cache/cached-loader.js";
import { mapWithConcurrency } from "./concurrency.js";

interface BenchmarkResult {
  scenario: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  toolInvocations: number;
  downstreamCalls: number;
}

describe("synthetic performance benchmark", () => {
  it("measures cold, warm, concurrent, legacy-five, and batch-five behavior", async () => {
    const report: BenchmarkResult[] = [];

    report.push(await benchmarkSingle("single-cold", false));
    report.push(await benchmarkSingle("single-warm", true));
    report.push(await benchmarkConcurrentTen());
    report.push(await benchmarkLegacyFive());
    report.push(await benchmarkBatchFive());

    console.error("[performance-benchmark] synthetic fake-adapter results", report);
    expect(report.find((item) => item.scenario === "concurrent-10")?.downstreamCalls).toBe(1);
    expect(report.find((item) => item.scenario === "legacy-five")?.toolInvocations).toBe(5);
    expect(report.find((item) => item.scenario === "batch-five")?.toolInvocations).toBe(1);
    expect(report.find((item) => item.scenario === "batch-five")?.downstreamCalls).toBeLessThan(25);
  });
});

async function benchmarkSingle(scenario: string, warm: boolean): Promise<BenchmarkResult> {
  let calls = 0;
  const loader = createLoader();
  const lookup = async (): Promise<string> => {
    calls += 1;
    await delay(3);
    return "ok";
  };
  if (warm) {
    await loader.load("destination", undefined, lookup);
    calls = 0;
  }

  const samples = await measure(20, () => loader.load("destination", undefined, lookup));
  return createResult(scenario, samples, 1, calls);
}

async function benchmarkConcurrentTen(): Promise<BenchmarkResult> {
  let calls = 0;
  const loader = createLoader();
  const startedAt = performance.now();
  await Promise.all(
    Array.from({ length: 10 }, () =>
      loader.load("destination", undefined, async () => {
        calls += 1;
        await delay(5);
        return "ok";
      }),
    ),
  );
  return createResult("concurrent-10", [performance.now() - startedAt], 10, calls);
}

async function benchmarkLegacyFive(): Promise<BenchmarkResult> {
  let calls = 0;
  const startedAt = performance.now();
  for (let index = 0; index < 5; index += 1) {
    for (let source = 0; source < 5; source += 1) {
      calls += 1;
      await delay(1);
    }
  }
  return createResult("legacy-five", [performance.now() - startedAt], 5, calls);
}

async function benchmarkBatchFive(): Promise<BenchmarkResult> {
  let calls = 0;
  const festivalLoader = createLoader();
  const chargerLoader = createLoader();
  const startedAt = performance.now();

  await mapWithConcurrency(["a", "b", "c", "d", "e"], 2, async (destination) => {
    await Promise.all([
      countedDelay(() => (calls += 1)),
      countedDelay(() => (calls += 1)),
      countedDelay(() => (calls += 1)),
      chargerLoader.load("seoul-jongno", undefined, () => countedValue(() => (calls += 1))),
      festivalLoader.load("nationwide", undefined, () => countedValue(() => (calls += 1))),
    ]);
    return destination;
  });

  return createResult("batch-five", [performance.now() - startedAt], 1, calls);
}

function createLoader(): CachedLoader<string, string> {
  return new CachedLoader("festival", { ttlMs: 1_000, maxEntries: 10 });
}

async function countedDelay(count: () => number): Promise<void> {
  count();
  await delay(1);
}

async function countedValue(count: () => number): Promise<string> {
  count();
  await delay(1);
  return "ok";
}

async function measure(count: number, operation: () => Promise<unknown>): Promise<number[]> {
  const samples: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now();
    await operation();
    samples.push(performance.now() - startedAt);
  }
  return samples;
}

function createResult(
  scenario: string,
  samples: number[],
  toolInvocations: number,
  downstreamCalls: number,
): BenchmarkResult {
  return {
    scenario,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    toolInvocations,
    downstreamCalls,
  };
}

function percentile(samples: number[], quantile: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1);
  return Math.round((sorted[index] ?? 0) * 100) / 100;
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
