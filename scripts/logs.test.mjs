import { describe, expect, it } from "vitest";

import { parseLogLines, renderEvents, selectEvents } from "./logs.mjs";

const events = [
  {
    timestamp: "2026-08-08T15:30:20.000Z",
    level: "info",
    event: "tool.start",
    requestId: "request-a",
    tool: "assess_accessible_visit",
  },
  {
    timestamp: "2026-08-08T15:30:21.000Z",
    level: "info",
    event: "downstream.call",
    requestId: "request-a",
    source: "weather",
    durationMs: 100,
    outcome: "success",
  },
  {
    timestamp: "2026-08-08T15:30:19.000Z",
    level: "info",
    event: "downstream.call",
    requestId: "request-b",
    source: "festival",
    durationMs: 50,
    outcome: "success",
  },
];

describe("local log viewer", () => {
  it("skips malformed NDJSON lines without failing", () => {
    const parsed = parseLogLines(
      `${JSON.stringify(events[0])}\nnot-json\n{"unfinished":\n${JSON.stringify(events[1])}\n`,
    );
    expect(parsed).toHaveLength(2);
  });

  it("filters one request and keeps its events in timestamp order", () => {
    const selected = selectEvents(events, ["request", "request-a"]);
    expect(selected.map((event) => event.requestId)).toEqual(["request-a", "request-a"]);
    expect(selected.map((event) => event.event)).toEqual(["tool.start", "downstream.call"]);
    expect(renderEvents(events, ["request", "request-a"])).toContain("REQUEST request-a");
  });

  it("filters only the selected downstream source", () => {
    expect(selectEvents(events, ["weather"]).map((event) => event.source)).toEqual(["weather"]);
    expect(selectEvents(events, ["festival"]).map((event) => event.source)).toEqual(["festival"]);
  });
});
