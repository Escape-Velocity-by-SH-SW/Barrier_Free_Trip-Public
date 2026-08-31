import { FestivalApiClient } from "../dist/infrastructure/festival/festival-api.client.js";
import { mapFestivalResponseToSourceData } from "../dist/infrastructure/festival/festival.mapper.js";
import { FetchHttpClient } from "../dist/infrastructure/http/http-client.js";
import { calculateDistanceKm } from "../dist/domain/geo.js";

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  process.stdout.write(`${helpText}\n`);
} else if (!options.execute) {
  process.stdout.write("festival filter verification dry-run: 외부 API를 호출하지 않았습니다.\n");
  process.stdout.write(
    "실행 시 nationwide 기준과 date/region/region+date 후보를 identity, 요청 수, 수신 row, latency로 비교합니다.\n",
  );
} else {
  validate(options);
  await verify(options);
}

async function verify(options) {
  process.stdout.write(
    `destination=${options.destination} visitDate=${options.visitDate} region=${options.region} radiusKm=${options.radiusKm}\n`,
  );
  const client = createClient();
  const baseline = await measure("FULL_SCAN", async () => {
    let apiRequestCount;
    const response = await client.getAllFestivals({
      logWriter: (event) => {
        if (event.event === "festival.scan.summary") {
          apiRequestCount = event.apiRequestCount;
        }
      },
    });
    if (!Number.isInteger(apiRequestCount)) {
      throw new Error("Festival full scan did not emit apiRequestCount.");
    }
    return {
      festivals: mapFestivalResponseToSourceData(response),
      requestCount: apiRequestCount,
      receivedRowCount: response.data?.length ?? 0,
    };
  });
  const candidates = [
    await loadCandidate(client, "DATE_EXACT_CANDIDATE", {
      festivalStartDate: options.visitDate,
      festivalEndDate: options.visitDate,
    }),
    await loadRegionCandidate(client, "REGION_CANDIDATE", options.region, {}),
    await loadRegionCandidate(client, "REGION_DATE_CANDIDATE", options.region, {
      festivalStartDate: options.visitDate,
      festivalEndDate: options.visitDate,
    }),
  ];

  const baselineNearby = nearbyActiveFestivals(baseline.festivals, options);
  printResult(baseline, baselineNearby, undefined);
  for (const candidate of candidates) {
    const nearby = nearbyActiveFestivals(candidate.festivals, options);
    printResult(candidate, nearby, compareIdentities(baselineNearby, nearby));
  }
  process.stdout.write(
    "\nSAMPLE_MATCH는 이 입력에서만 같은 결과라는 뜻입니다. 날짜 비교 연산 의미와 행정구역 경계 케이스를 모두 검증하기 전에는 production 대체 근거가 아닙니다.\n",
  );
}

function createClient() {
  const baseUrl = requiredEnv("FESTIVAL_API_BASE_URL");
  const serviceKey = requiredEnv("FESTIVAL_API_SERVICE_KEY");
  return new FestivalApiClient(
    new FetchHttpClient({ baseUrl, defaultTimeoutMs: 10_000, source: "festival" }),
    {
      path: "/openapi/tn_pubr_public_cltur_fstvl_api",
      serviceKey,
      defaultPerPage: 1000,
      fullScanPageSize: 1000,
    },
  );
}

async function loadRegionCandidate(client, name, region, filters) {
  return measure(name, async () => {
    const [road, lot] = await Promise.all([
      loadAllMatching(client, { ...filters, roadAddress: region }),
      loadAllMatching(client, { ...filters, lotAddress: region }),
    ]);
    return {
      festivals: uniqueById([...road.festivals, ...lot.festivals]),
      requestCount: road.requestCount + lot.requestCount,
      receivedRowCount: road.receivedRowCount + lot.receivedRowCount,
    };
  });
}

async function loadCandidate(client, name, filters) {
  return measure(name, () => loadAllMatching(client, filters));
}

async function loadAllMatching(client, filters) {
  const first = await client.getFestivals({ ...filters, page: 1, perPage: 1000 });
  const totalCount = Number(first.totalCount ?? first.data?.length ?? 0);
  const pageCount = Math.max(1, Math.ceil(totalCount / 1000));
  const pages = Array.from({ length: pageCount - 1 }, (_, index) => index + 2);
  const remaining = [];
  for (let index = 0; index < pages.length; index += 4) {
    const batch = pages.slice(index, index + 4);
    remaining.push(
      ...(await Promise.all(
        batch.map((page) => client.getFestivals({ ...filters, page, perPage: 1000 })),
      )),
    );
  }
  const responses = [first, ...remaining];
  return {
    festivals: mapFestivalResponseToSourceData({
      ...first,
      data: responses.flatMap((response) => response.data ?? []),
    }),
    requestCount: responses.length,
    receivedRowCount: responses.reduce(
      (count, response) => count + (response.data?.length ?? 0),
      0,
    ),
  };
}

async function measure(name, operation) {
  const startedAt = performance.now();
  const result = await operation();
  return { name, latencyMs: round(performance.now() - startedAt), ...result };
}

function nearbyActiveFestivals(festivals, options) {
  return festivals.filter(
    (festival) =>
      festival.startDate <= options.visitDate &&
      options.visitDate <= festival.endDate &&
      festival.latitude !== undefined &&
      festival.longitude !== undefined &&
      calculateDistanceKm(
        { latitude: options.latitude, longitude: options.longitude },
        { latitude: festival.latitude, longitude: festival.longitude },
      ) <= options.radiusKm,
  );
}

function compareIdentities(baseline, candidate) {
  const baselineIds = new Set(baseline.map((festival) => festival.id));
  const candidateIds = new Set(candidate.map((festival) => festival.id));
  return {
    missing: [...baselineIds].filter((id) => !candidateIds.has(id)),
    additional: [...candidateIds].filter((id) => !baselineIds.has(id)),
  };
}

function printResult(result, nearby, comparison) {
  const verdict =
    comparison === undefined
      ? "BASELINE"
      : comparison.missing.length === 0 && comparison.additional.length === 0
        ? "SAMPLE_MATCH"
        : "MISMATCH";
  process.stdout.write(
    `\n${result.name}: ${verdict}\nlatency=${result.latencyMs}ms requests=${result.requestCount} receivedRows=${result.receivedRowCount} nearby=${nearby.length}\n`,
  );
  if (comparison !== undefined) {
    process.stdout.write(
      `missing=${comparison.missing.length} additional=${comparison.additional.length}\n`,
    );
    if (comparison.missing.length > 0) {
      process.stdout.write(`missingIds=${comparison.missing.join(",")}\n`);
    }
  }
}

function uniqueById(festivals) {
  return [...new Map(festivals.map((festival) => [festival.id, festival])).values()];
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
    destination: values.get("--destination") ?? "경복궁",
    visitDate: values.get("--visit-date") ?? getTomorrowInKorea(),
    region: values.get("--region") ?? "서울특별시",
    latitude: Number(values.get("--latitude") ?? 37.5796),
    longitude: Number(values.get("--longitude") ?? 126.977),
    radiusKm: Number(values.get("--radius-km") ?? 3),
  };
}

function validate(options) {
  for (const key of ["destination", "visitDate", "region"]) {
    if (typeof options[key] !== "string" || options[key].trim() === "") {
      throw new Error(`--${toKebabCase(key)} is required with --execute.`);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.visitDate)) {
    throw new Error("--visit-date must be YYYY-MM-DD.");
  }
  for (const key of ["latitude", "longitude", "radiusKm"]) {
    if (!Number.isFinite(options[key])) throw new Error(`--${toKebabCase(key)} must be a number.`);
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (value === undefined || value === "") throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function toKebabCase(value) {
  return value.replaceAll(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function getTomorrowInKorea() {
  const koreaNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  koreaNow.setDate(koreaNow.getDate() + 1);
  const year = koreaNow.getFullYear();
  const month = String(koreaNow.getMonth() + 1).padStart(2, "0");
  const day = String(koreaNow.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const helpText = `Usage:
  npm run verify:festival-filters -- [--execute] [options]

Defaults (override as needed):
  --destination <name>
  --visit-date <YYYY-MM-DD>
  --region <address prefix>     예: 서울특별시
  --latitude <number>
  --longitude <number>

Optional:
  --radius-km <number>          기본 3
  --help`;
