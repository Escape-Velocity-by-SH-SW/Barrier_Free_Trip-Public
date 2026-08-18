import { randomUUID } from "node:crypto";

import { createContainer } from "../dist/bootstrap/create-container.js";
import { InMemoryRequestTelemetry } from "../dist/application/services/request-telemetry.js";

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write(`${helpText}\n`);
} else if (!options.execute) {
  printDryRun(options);
} else {
  validateExecutionOptions(options);
  await runBenchmark(options);
}

async function runBenchmark(options) {
  process.stdout.write(
    "실제 공공 API를 호출합니다. 이 결과는 로컬 MCP 서버 구간이며 Kakao end-to-end latency가 아닙니다.\n",
  );

  const coldSamples = [];
  for (let index = 0; index < options.coldCount; index += 1) {
    const container = createContainer(process.env);
    coldSamples.push(await measure(container, options, "COLD", index + 1));
  }

  const warmContainer = createContainer(process.env);
  await measure(warmContainer, options, "WARM_PRIME", 0, false);
  const warmSamples = [];
  for (let index = 0; index < options.warmCount; index += 1) {
    warmSamples.push(await measure(warmContainer, options, "WARM", index + 1));
  }

  printSummary("Cold", coldSamples);
  printSummary("Warm", warmSamples);
}

async function measure(container, options, phase, iteration, print = true) {
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

  const durationMs = round(performance.now() - startedAt);
  const sourceEvents = events.filter((event) => event.event === "source.summary");
  const sourceStatuses = Object.fromEntries(
    sourceEvents.map((event) => [
      event.source,
      {
        status: event.status,
        outcome: event.outcome,
        latencyMs: event.durationMs,
        timeout: event.timeout === true,
      },
    ]),
  );
  const cacheEvents = events.filter(
    (event) => event.event === "cache.hit" || event.event === "cache.miss",
  );
  const sample = {
    durationMs,
    status: error === undefined ? assessment.overallAssessment.status : "FAILED",
    partial: error === undefined && assessment.overallAssessment.status === "CHECK_REQUIRED",
    deadlineExceeded: events.some(
      (event) => event.event === "deadline.exceeded" && event.scope !== "source",
    ),
    sourceStatuses,
    cacheHits: cacheEvents.filter((event) => event.event === "cache.hit").length,
    cacheMisses: cacheEvents.filter((event) => event.event === "cache.miss").length,
    festivalScan: events.find((event) => event.event === "festival.scan.summary"),
  };

  if (print) {
    process.stdout.write(
      `${phase} #${iteration} total=${durationMs}ms status=${sample.status} partial=${sample.partial} deadlineExceeded=${sample.deadlineExceeded} cache=${sample.cacheHits}/${sample.cacheMisses}\n`,
    );
    for (const [source, result] of Object.entries(sourceStatuses)) {
      process.stdout.write(
        `  ${source}: ${result.status}/${result.outcome} ${result.latencyMs}ms timeout=${result.timeout}\n`,
      );
    }
    if (sample.festivalScan !== undefined) {
      process.stdout.write(
        `  festival-scan: pages=${sample.festivalScan.pageCount} calls=${sample.festivalScan.apiRequestCount} rows=${sample.festivalScan.receivedRowCount} ${sample.festivalScan.durationMs}ms\n`,
      );
    }
  }

  return sample;
}

function printSummary(label, samples) {
  const durations = samples
    .map((sample) => sample.durationMs)
    .toSorted((left, right) => left - right);
  const partialCount = samples.filter((sample) => sample.partial).length;
  const timeoutCount = samples.filter((sample) => sample.deadlineExceeded).length;
  process.stdout.write(`\n${label} (${samples.length})\n`);
  process.stdout.write(
    `average=${round(average(durations))}ms p50=${percentile(durations, 0.5)}ms p95=${percentile(durations, 0.95)}ms p99=${percentile(durations, 0.99)}ms timeoutRate=${rate(timeoutCount, samples.length)} partialRate=${rate(partialCount, samples.length)}\n`,
  );
  process.stdout.write("참고 기준: average <= 100ms, p99 <= 3000ms (로컬 서버 구간 측정)\n");
}

function printDryRun(options) {
  process.stdout.write("assessment benchmark dry-run: 외부 API를 호출하지 않았습니다.\n");
  process.stdout.write(
    `계획: cold=${options.coldCount}, warm=${options.warmCount}, radius=${options.radiusKm}km\n`,
  );
  process.stdout.write(
    "실행 예: npm run benchmark:assessment -- --execute --destination 경복궁 --visit-date 2026-08-22 --traveler-type POWER_WHEELCHAIR\n",
  );
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute" || argument === "--help") {
      values.set(argument, true);
      continue;
    }
    if (argument?.startsWith("--") === true) {
      values.set(argument, args[index + 1]);
      index += 1;
    }
  }
  return {
    execute: values.get("--execute") === true,
    help: values.get("--help") === true,
    destination: values.get("--destination"),
    visitDate: values.get("--visit-date"),
    travelerType: values.get("--traveler-type") ?? "POWER_WHEELCHAIR",
    radiusKm: positiveNumber(values.get("--radius-km"), 3),
    coldCount: positiveInteger(values.get("--cold-count"), 1),
    warmCount: positiveInteger(values.get("--warm-count"), 5),
  };
}

function validateExecutionOptions(options) {
  if (typeof options.destination !== "string" || options.destination.trim() === "") {
    throw new Error("--destination is required with --execute.");
  }
  if (typeof options.visitDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(options.visitDate)) {
    throw new Error("--visit-date must be YYYY-MM-DD with --execute.");
  }
  if (
    !new Set(["POWER_WHEELCHAIR", "MANUAL_WHEELCHAIR", "STROLLER", "ELDERLY_COMPANION"]).has(
      options.travelerType,
    )
  ) {
    throw new Error("--traveler-type is invalid.");
  }
}

function positiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`Expected positive integer: ${value}`);
  return parsed;
}

function positiveNumber(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`Expected positive number: ${value}`);
  return parsed;
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, quantile) {
  return values[Math.max(0, Math.ceil(values.length * quantile) - 1)];
}

function rate(count, total) {
  return `${round((count / total) * 100)}%`;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

const helpText = `Usage:
  npm run benchmark:assessment -- [--execute] [options]

Options:
  --execute                 실제 공공 API 호출 허용 (없으면 dry-run)
  --destination <name>      관광지명 (실행 시 필수)
  --visit-date <YYYY-MM-DD> 방문일 (실행 시 필수)
  --traveler-type <type>    기본 POWER_WHEELCHAIR
  --radius-km <number>      기본 3
  --cold-count <number>     fresh container 반복 수, 기본 1
  --warm-count <number>     same-process cache 반복 수, 기본 5
  --help                    도움말`;
