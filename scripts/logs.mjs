import { createReadStream, unwatchFile, watchFile } from "node:fs";
import { mkdir, readFile, stat, truncate, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sourceNames = new Set(["weather", "festival", "charger", "tourism"]);
const defaultLogFile = resolve(process.cwd(), "logs/mcp.ndjson");

export function parseLogLines(text) {
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      const value = JSON.parse(line);
      if (
        typeof value === "object" &&
        value !== null &&
        typeof value.event === "string" &&
        typeof value.timestamp === "string"
      ) {
        events.push(value);
      }
    } catch {
      // 로컬 파일에는 중간에 끊긴 줄이 있을 수 있으므로 안전하게 건너뛴다.
    }
  }
  return events;
}

export function selectEvents(events, args) {
  const [mode, value] = args;
  if (mode === "request") {
    return events
      .filter((event) => event.requestId === value)
      .toSorted((left, right) => left.timestamp.localeCompare(right.timestamp));
  }
  if (sourceNames.has(mode)) {
    return events.filter((event) => event.source === mode);
  }
  if (mode === "errors") {
    return events.filter(isProblemEvent);
  }
  return events.filter((event) => event.event === "tool.summary").slice(-20);
}

export function formatEvent(event) {
  const time = formatTime(event.timestamp);
  const request = typeof event.requestId === "string" ? ` request=${event.requestId}` : "";
  const duration = typeof event.durationMs === "number" ? ` ${event.durationMs}ms` : "";
  const outcome = upper(event.outcome ?? event.status ?? event.level);

  if (event.event === "tool.start") {
    return `[${time}] TOOL ${text(event.tool)} START${request}`;
  }
  if (event.event === "tool.summary") {
    const counters = [
      `cache=${number(event.cacheHit)}/${number(event.cacheMiss)}`,
      `calls=${number(event.downstreamCalls)}`,
      `retry=${number(event.retryCount)}`,
      `timeout=${number(event.timeoutCount)}`,
      `partial=${number(event.partialResultCount)}`,
    ].join(" ");
    return `[${time}] TOOL ${text(event.tool)} ${outcome}${duration} ${counters}${request}`;
  }
  if (event.event === "downstream.call") {
    return `[${time}] API  ${text(event.source)} ${outcome}${duration}${request}`;
  }
  if (event.event === "downstream.retry") {
    const delay = typeof event.delayMs === "number" ? ` delay=${event.delayMs}ms` : "";
    return `[${time}] API  ${text(event.source)} RETRY${delay}${request}`;
  }
  if (event.event === "cache.hit" || event.event === "cache.miss") {
    return `[${time}] CACHE ${text(event.source)} ${event.event.endsWith("hit") ? "HIT" : "MISS"}${request}`;
  }
  if (event.event === "singleflight.join") {
    return `[${time}] CACHE ${text(event.source)} SINGLE-FLIGHT JOIN${request}`;
  }
  if (event.event === "deadline.exceeded") {
    return `[${time}] TOOL ${text(event.tool)} DEADLINE EXCEEDED${request}`;
  }
  if (event.event === "tool.error") {
    return `[${time}] TOOL ${text(event.tool)} ERROR ${text(event.errorName)}: ${text(event.errorMessage)}${request}`;
  }
  return `[${time}] ${event.event} ${outcome}${request}`;
}

export function renderEvents(events, args) {
  const selected = selectEvents(events, args);
  const header = args[0] === "request" ? `REQUEST ${args[1] ?? "(id 없음)"}\n\n` : "";
  if (selected.length === 0) {
    return `${header}조건에 맞는 로그가 없습니다.`;
  }
  return header + selected.map(formatEvent).join("\n");
}

export async function runCli(args = process.argv.slice(2), logFile = defaultLogFile) {
  const [mode, value] = args;
  if (mode === "help") {
    process.stdout.write(helpText);
    return;
  }
  if (mode === "clear") {
    await ensureLogFile(logFile);
    await truncate(logFile, 0);
    process.stdout.write("logs/mcp.ndjson 로그를 비웠습니다.\n");
    return;
  }
  if (mode === "request" && value === undefined) {
    process.stderr.write("requestId가 필요합니다. 예: npm run logs -- request <id>\n");
    process.exitCode = 1;
    return;
  }
  if (mode === "tail") {
    await tailLogs(logFile);
    return;
  }
  if (mode !== undefined && mode !== "errors" && mode !== "request" && !sourceNames.has(mode)) {
    process.stderr.write(`알 수 없는 명령입니다: ${mode}\n\n${helpText}`);
    process.exitCode = 1;
    return;
  }

  const contents = await readLogFile(logFile);
  process.stdout.write(`${renderEvents(parseLogLines(contents), args)}\n`);
}

async function tailLogs(logFile) {
  await ensureLogFile(logFile);
  let offset = (await stat(logFile)).size;
  let remainder = "";
  process.stdout.write("새 로그를 기다립니다. 종료: Ctrl+C\n");

  const onChange = async () => {
    const size = (await stat(logFile)).size;
    if (size < offset) {
      offset = 0;
      remainder = "";
    }
    if (size === offset) return;

    const chunks = [];
    for await (const chunk of createReadStream(logFile, { start: offset, end: size - 1 })) {
      chunks.push(chunk);
    }
    offset = size;
    const textChunk = remainder + Buffer.concat(chunks).toString("utf8");
    const lines = textChunk.split(/\r?\n/);
    remainder = lines.pop() ?? "";
    for (const event of parseLogLines(lines.join("\n"))) {
      process.stdout.write(`${formatEvent(event)}\n`);
    }
  };

  watchFile(logFile, { interval: 250 }, onChange);
  await new Promise((resolvePromise) => {
    const stop = () => {
      unwatchFile(logFile, onChange);
      resolvePromise();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}

async function ensureLogFile(logFile) {
  await mkdir(dirname(logFile), { recursive: true });
  try {
    await stat(logFile);
  } catch {
    await writeFile(logFile, "", "utf8");
  }
}

async function readLogFile(logFile) {
  try {
    return await readFile(logFile, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") return "";
    throw error;
  }
}

function isProblemEvent(event) {
  return (
    event.level === "error" ||
    event.event === "downstream.retry" ||
    event.event === "deadline.exceeded" ||
    event.outcome === "failure" ||
    event.outcome === "timeout" ||
    event.status === "PARTIAL_SUCCESS" ||
    number(event.partialResultCount) > 0
  );
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "--:--:--" : date.toISOString().slice(11, 19);
}

function text(value) {
  return typeof value === "string" ? value : "-";
}

function number(value) {
  return typeof value === "number" ? value : 0;
}

function upper(value) {
  return typeof value === "string" ? value.toUpperCase() : "-";
}

const helpText = `Bopok MCP Local Log Viewer

npm run logs
  최근 MCP Tool 실행 요약

npm run logs -- tail
  새 로그를 실시간으로 표시

npm run logs -- errors
  오류 / timeout / retry / 부분 결과만 표시

npm run logs -- weather|festival|charger|tourism
  선택한 외부 데이터 source 로그만 표시

npm run logs -- request <id>
  특정 MCP 요청의 전체 흐름 표시

npm run logs -- clear
  로컬 로그 파일 초기화

npm run logs -- help
  이 도움말 표시
`;

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}
