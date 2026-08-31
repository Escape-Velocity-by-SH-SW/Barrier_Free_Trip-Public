import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createContainer } from "../dist/bootstrap/create-container.js";
import { InMemoryRequestTelemetry } from "../dist/application/services/request-telemetry.js";

const scriptPath = fileURLToPath(import.meta.url);
const defaultDestinations = ["경복궁", "수원화성", "첨성대", "남산서울타워", "해운대해수욕장"];
const assessmentSources = ["accessibility", "weather", "charger", "festival"];
const options = parseArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write(`${helpText}\n`);
} else if (options.childSample) {
  validateChildOptions(options);
  await runChildSample(options);
} else if (!options.execute) {
  printDryRun(options);
} else {
  validateExecutionOptions(options);
  await runFreshProcessBenchmark(options);
}

async function runFreshProcessBenchmark(options) {
  process.stdout.write(
    "실제 공공 API를 순차 호출합니다. 각 Cold sample은 fresh Node process/cache이며 Kakao end-to-end latency가 아닙니다.\n",
  );

  const coldSamples = [];
  const warmSamples = [];
  for (let index = 0; index < options.coldRuns; index += 1) {
    const destination = options.destinations[index % options.destinations.length];
    const childWarmRuns = distributedRuns(options.warmRuns, options.coldRuns, index);
    const result = await runFreshProcessSample({
      ...options,
      destination,
      childWarmRuns,
      iteration: index + 1,
    });
    coldSamples.push(result.cold);
    warmSamples.push(...result.warm);
    printSample("COLD", index + 1, result.cold);
    for (const [warmIndex, sample] of result.warm.entries()) {
      printSample("WARM", warmSamples.length - result.warm.length + warmIndex + 1, sample);
    }

    if (index + 1 < options.coldRuns && options.coldDelayMs > 0) {
      await delay(options.coldDelayMs);
    }
  }

  printColdSummary(coldSamples);
  printWarmSummary(warmSamples);
}

async function runFreshProcessSample(options) {
  const childArgs = [
    scriptPath,
    "--execute",
    "--child-sample",
    "--destination",
    options.destination,
    "--visit-date",
    options.visitDate,
    "--traveler-type",
    options.travelerType,
    "--radius-km",
    String(options.radiusKm),
    "--child-warm-runs",
    String(options.childWarmRuns),
  ];
  const child = spawn(process.execPath, childArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const output = Buffer.concat(stdout).toString("utf8").trim();
  const diagnostic = Buffer.concat(stderr).toString("utf8").trim();
  if (exitCode !== 0) {
    throw new Error(
      `Cold child process failed for ${options.destination} (exit=${exitCode}).${diagnostic === "" ? "" : `\n${diagnostic}`}`,
    );
  }
  if (diagnostic !== "") {
    process.stderr.write(`[${options.destination}] child diagnostic:\n${diagnostic}\n`);
  }
  return JSON.parse(output);
}

async function runChildSample(options) {
  const container = createContainer(process.env);
  const cold = await measure(container, options);
  const warm = [];
  for (let index = 0; index < options.childWarmRuns; index += 1) {
    warm.push(await measure(container, options));
  }
  process.stdout.write(JSON.stringify({ cold, warm }));
}

async function measure(container, options) {
  const requestId = randomUUID();
  const events = [];
  const telemetry = new InMemoryRequestTelemetry({
    requestId,
    tool: "assess_accessible_visit",
    log: (event) => events.push(event),
  });
  const startedAt = performance.now();
  let assessment;
  let error;

  try {
    assessment = await container.services.visitAssessmentService.assess({
      destination: options.destination,
      visitDate: options.visitDate,
      travelerType: options.travelerType,
      radiusKm: options.radiusKm,
      context: {
        requestId,
        tool: "assess_accessible_visit",
        telemetry,
        logWriter: (event) => events.push(event),
      },
    });
  } catch (caught) {
    error = caught;
  }

  const totalLatencyMs = round(performance.now() - startedAt);
  const toolSummary = events.findLast((event) => event.event === "tool.summary");
  const sourceEvents = events.filter((event) => event.event === "source.summary");
  const sources = Object.fromEntries(
    assessmentSources.map((source) => {
      const sourceEvent = sourceEvents.find((event) => event.source === source);
      return [source, createSourceMeasurement(source, sourceEvent, events)];
    }),
  );
  const overallAssessmentStatus = assessment?.overallAssessment.status;
  const partial = overallAssessmentStatus === "CHECK_REQUIRED";

  return {
    destination: options.destination,
    resolvedDestination: assessment?.destination.name,
    visitDate: options.visitDate,
    travelerType: options.travelerType,
    totalLatencyMs,
    topLevelStatus: error !== undefined ? "FAILED" : partial ? "PARTIAL_SUCCESS" : "SUCCESS",
    overallAssessmentStatus: overallAssessmentStatus ?? "FAILED",
    partial,
    deadlineExceeded: events.some(
      (event) => event.event === "deadline.exceeded" && event.scope !== "source",
    ),
    destinationResolution: {
      latencyMs: numberOrUndefined(toolSummary?.destinationResolutionLatencyMs),
      status: error === undefined ? "RESOLVED" : "FAILED",
      ...createDownstreamMeasurement("tourism", events),
    },
    sources,
    cacheHits: events.filter((event) => event.event === "cache.hit").length,
    cacheMisses: events.filter((event) => event.event === "cache.miss").length,
    festivalScan: sanitizeFestivalScan(
      events.find((event) => event.event === "festival.scan.summary"),
    ),
    ...(error !== undefined
      ? { errorName: error instanceof Error ? error.name : "UnknownError" }
      : {}),
  };
}

function createSourceMeasurement(source, sourceEvent, events) {
  return {
    latencyMs: numberOrUndefined(sourceEvent?.durationMs),
    status: sourceEvent?.status ?? "NOT_RECORDED",
    outcome: sourceEvent?.outcome ?? "NOT_RECORDED",
    timeout: sourceEvent?.timeout === true,
    budgetMs: numberOrUndefined(sourceEvent?.budgetMs),
    ...createDownstreamMeasurement(source, events),
  };
}

function createDownstreamMeasurement(source, events) {
  const calls = events.filter(
    (event) => event.event === "downstream.call" && event.source === source,
  );
  const retries = events.filter(
    (event) => event.event === "downstream.retry" && event.source === source,
  );
  const cache = events
    .filter(
      (event) =>
        (event.event === "cache.hit" || event.event === "cache.miss") && event.source === source,
    )
    .map((event) => ({
      result: event.event === "cache.hit" ? "HIT" : "MISS",
      ...(typeof event.cacheLayer === "string" ? { layer: event.cacheLayer } : {}),
    }));
  return {
    cache,
    httpAttempts: calls.length,
    retryCount: retries.length,
    firstAttemptTimeout: calls[0]?.outcome === "timeout",
    httpTimeoutCount: calls.filter((event) => event.outcome === "timeout").length,
  };
}

function sanitizeFestivalScan(event) {
  if (event === undefined) return undefined;
  return {
    status: event.status,
    latencyMs: event.durationMs,
    pageCount: event.pageCount,
    apiRequestCount: event.apiRequestCount,
    receivedRowCount: event.receivedRowCount,
  };
}

function printSample(phase, iteration, sample) {
  process.stdout.write(
    `${phase} #${iteration} destination=${sample.destination} resolved=${sample.resolvedDestination ?? "-"} date=${sample.visitDate} total=${sample.totalLatencyMs}ms topLevel=${sample.topLevelStatus} overall=${sample.overallAssessmentStatus} partial=${sample.partial} deadlineExceeded=${sample.deadlineExceeded}\n`,
  );
  process.stdout.write(
    `  destination-resolution: ${formatLatency(sample.destinationResolution.latencyMs)} cache=${formatCache(sample.destinationResolution.cache)} attempts=${sample.destinationResolution.httpAttempts} retry=${sample.destinationResolution.retryCount}\n`,
  );
  for (const source of assessmentSources) {
    const result = sample.sources[source];
    process.stdout.write(
      `  ${source}: ${result.status}/${result.outcome} ${formatLatency(result.latencyMs)} budget=${formatLatency(result.budgetMs)} timeout=${result.timeout} cache=${formatCache(result.cache)} attempts=${result.httpAttempts} retry=${result.retryCount} firstAttemptTimeout=${result.firstAttemptTimeout}\n`,
    );
  }
  if (sample.festivalScan !== undefined) {
    process.stdout.write(
      `  festival-scan: status=${sample.festivalScan.status} pages=${sample.festivalScan.pageCount} calls=${sample.festivalScan.apiRequestCount} rows=${sample.festivalScan.receivedRowCount} ${formatLatency(sample.festivalScan.latencyMs)}\n`,
    );
  }
}

function printColdSummary(samples) {
  process.stdout.write(`\nLocal fresh-process Cold summary (${samples.length} samples)\n`);
  process.stdout.write(
    "Source          count      avg      min      p50      p95      p99      max  timeout\n",
  );
  printStatsRow(
    "destination",
    samples.map((sample) => sample.destinationResolution.latencyMs),
    0,
  );
  for (const source of assessmentSources) {
    const timeouts = samples.filter((sample) => sample.sources[source].timeout).length;
    printStatsRow(
      source,
      samples.map((sample) => sample.sources[source].latencyMs),
      timeouts,
    );
  }

  const totalStats = calculateStats(samples.map((sample) => sample.totalLatencyMs));
  const deadlineCount = samples.filter((sample) => sample.deadlineExceeded).length;
  const partialCount = samples.filter((sample) => sample.partial).length;
  process.stdout.write(
    `\nTotal: count=${totalStats.count} avg=${totalStats.average}ms min=${totalStats.min}ms p50=${totalStats.p50}ms p95=${totalStats.p95}ms p99=${totalStats.p99}ms max=${totalStats.max}ms deadlineExceeded=${deadlineCount}/${samples.length} (${rate(deadlineCount, samples.length)}) partial=${partialCount}/${samples.length} (${rate(partialCount, samples.length)})\n`,
  );

  const weather = aggregateSourceDiagnostics(samples, "weather");
  process.stdout.write(
    `Weather HTTP: attempts=${weather.httpAttempts} retries=${weather.retryCount} firstAttemptTimeout=${weather.firstAttemptTimeoutCount} HTTP-timeouts=${weather.httpTimeoutCount}\n`,
  );
  const scans = samples.flatMap((sample) =>
    sample.festivalScan === undefined ? [] : [sample.festivalScan],
  );
  process.stdout.write(
    `Festival scans: ${scans.length}/${samples.length}, API requests=${sum(scans.map((scan) => scan.apiRequestCount))}, received rows=${sum(scans.map((scan) => scan.receivedRowCount))}\n`,
  );
  process.stdout.write(
    "주의: 표의 p99는 소수의 local Cold sample p99이며 Kakao 운영 p99를 증명하지 않습니다.\n",
  );
}

function printWarmSummary(samples) {
  if (samples.length === 0) {
    process.stdout.write("\nWarm: 실행하지 않음\n");
    return;
  }
  const stats = calculateStats(samples.map((sample) => sample.totalLatencyMs));
  const allCacheHit = samples.every(
    (sample) =>
      sample.cacheMisses === 0 &&
      sample.destinationResolution.cache.some((entry) => entry.result === "HIT") &&
      assessmentSources.every((source) =>
        sample.sources[source].cache.some((entry) => entry.result === "HIT"),
      ),
  );
  process.stdout.write(
    `\nWarm (${samples.length}): avg=${stats.average}ms min=${stats.min}ms p50=${stats.p50}ms p95=${stats.p95}ms p99=${stats.p99}ms max=${stats.max}ms allSourceCacheHit=${allCacheHit}\n`,
  );
}

function printStatsRow(label, values, timeoutCount) {
  const stats = calculateStats(values);
  process.stdout.write(
    `${label.padEnd(15)} ${String(stats.count).padStart(5)} ${formatColumn(stats.average)} ${formatColumn(stats.min)} ${formatColumn(stats.p50)} ${formatColumn(stats.p95)} ${formatColumn(stats.p99)} ${formatColumn(stats.max)} ${rate(timeoutCount, stats.count).padStart(8)}\n`,
  );
}

function calculateStats(values) {
  const sorted = values
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .toSorted((left, right) => left - right);
  if (sorted.length === 0) {
    return { count: 0, average: 0, min: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  }
  return {
    count: sorted.length,
    average: round(sum(sorted) / sorted.length),
    min: sorted[0],
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1),
  };
}

function aggregateSourceDiagnostics(samples, source) {
  return {
    httpAttempts: sum(samples.map((sample) => sample.sources[source].httpAttempts)),
    retryCount: sum(samples.map((sample) => sample.sources[source].retryCount)),
    firstAttemptTimeoutCount: samples.filter((sample) => sample.sources[source].firstAttemptTimeout)
      .length,
    httpTimeoutCount: sum(samples.map((sample) => sample.sources[source].httpTimeoutCount)),
  };
}

function printDryRun(options) {
  process.stdout.write("assessment benchmark dry-run: 외부 API를 호출하지 않았습니다.\n");
  process.stdout.write(
    `계획: fresh-process cold=${options.coldRuns}, warm=${options.warmRuns}, delay=${options.coldDelayMs}ms, visitDate=${options.visitDate}, destinations=${options.destinations.join(", ")}\n`,
  );
  process.stdout.write(
    "실행 예: npm run benchmark:assessment -- --execute --cold-runs 20 --warm-runs 5\n",
  );
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute" || argument === "--help" || argument === "--child-sample") {
      values.set(argument, true);
      continue;
    }
    if (argument?.startsWith("--") === true) {
      values.set(argument, args[index + 1]);
      index += 1;
    }
  }
  const destination = values.get("--destination");
  const destinations = parseDestinations(values.get("--destinations"), destination);
  return {
    execute: values.get("--execute") === true,
    help: values.get("--help") === true,
    childSample: values.get("--child-sample") === true,
    destination,
    destinations,
    visitDate: values.get("--visit-date") ?? getTomorrowInKorea(),
    travelerType: values.get("--traveler-type") ?? "POWER_WHEELCHAIR",
    radiusKm: positiveNumber(values.get("--radius-km"), 3),
    coldRuns: positiveInteger(values.get("--cold-runs") ?? values.get("--cold-count"), 1),
    warmRuns: nonnegativeInteger(values.get("--warm-runs") ?? values.get("--warm-count"), 5),
    coldDelayMs: nonnegativeInteger(values.get("--cold-delay-ms"), 250),
    childWarmRuns: nonnegativeInteger(values.get("--child-warm-runs"), 0),
  };
}

function parseDestinations(value, destination) {
  if (typeof value === "string") {
    const parsed = value
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
    if (parsed.length > 0) return parsed;
  }
  return typeof destination === "string" && destination.trim() !== ""
    ? [destination.trim()]
    : defaultDestinations;
}

function validateExecutionOptions(options) {
  validateCommonOptions(options);
  if (options.destinations.length === 0) throw new Error("At least one destination is required.");
}

function validateChildOptions(options) {
  validateCommonOptions(options);
  if (typeof options.destination !== "string" || options.destination.trim() === "") {
    throw new Error("--destination is required for a child sample.");
  }
}

function validateCommonOptions(options) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.visitDate)) {
    throw new Error("--visit-date must be YYYY-MM-DD.");
  }
  if (
    !new Set(["POWER_WHEELCHAIR", "MANUAL_WHEELCHAIR", "STROLLER", "ELDERLY_COMPANION"]).has(
      options.travelerType,
    )
  ) {
    throw new Error("--traveler-type is invalid.");
  }
}

function getTomorrowInKorea() {
  const koreaNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  koreaNow.setDate(koreaNow.getDate() + 1);
  const year = koreaNow.getFullYear();
  const month = String(koreaNow.getMonth() + 1).padStart(2, "0");
  const day = String(koreaNow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function distributedRuns(total, slots, index) {
  return Math.floor(total / slots) + (index < total % slots ? 1 : 0);
}

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer: ${value}`);
  }
  return parsed;
}

function nonnegativeInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected nonnegative integer: ${value}`);
  }
  return parsed;
}

function positiveNumber(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected positive number: ${value}`);
  }
  return parsed;
}

function percentile(values, quantile) {
  return values[Math.max(0, Math.ceil(values.length * quantile) - 1)];
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function rate(count, total) {
  return total === 0 ? "0%" : `${round((count / total) * 100)}%`;
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatLatency(value) {
  return value === undefined ? "-" : `${value}ms`;
}

function formatCache(cache) {
  return cache.length === 0
    ? "-"
    : cache
        .map((entry) => `${entry.layer === undefined ? "" : `${entry.layer}:`}${entry.result}`)
        .join(",");
}

function formatColumn(value) {
  return String(value).padStart(8);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

const helpText = `Usage:
  npm run benchmark:assessment -- [--execute] [options]

Options:
  --execute                    실제 공공 API 호출 허용 (없으면 dry-run)
  --destination <name>         단일 관광지
  --destinations <a,b,c>       순환 측정할 관광지 목록
  --visit-date <YYYY-MM-DD>    기본값: 한국 기준 내일
  --traveler-type <type>       기본 POWER_WHEELCHAIR
  --radius-km <number>         기본 3
  --cold-runs <number>         fresh Node process 반복 수, 기본 1
  --warm-runs <number>         Cold 뒤 같은 process에서 실행할 총 Warm 수, 기본 5
  --cold-delay-ms <number>     Cold process 사이 대기, 기본 250
  --help                       도움말`;
