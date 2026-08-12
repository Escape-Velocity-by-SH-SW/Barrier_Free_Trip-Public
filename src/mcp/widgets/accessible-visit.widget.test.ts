import { describe, expect, it } from "vitest";

import type {
  AccessibleVisitAssessment,
  VisitAssessmentStatus,
} from "../../domain/visit-assessment.js";
import {
  buildAccessibleVisitWidgetEnvelope,
  buildPreparationItems,
} from "./accessible-visit.widget.js";
import { createWidgetToolResult } from "./widget-result.js";

describe("accessible visit ChatKit widget", () => {
  it("creates a Kakao envelope for a successful assessment without widget.status", () => {
    const assessment = createAssessment();
    const envelope = buildAccessibleVisitWidgetEnvelope(assessment);
    const result = createWidgetToolResult(
      { status: "SUCCESS", ...assessment },
      {
        buildEnvelope: () => envelope,
      },
    );
    const contentEnvelope = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;

    expect(envelope.widget).toBeDefined();
    expect(envelope.widget.type).toBe("Card");
    expect(envelope.copy_text).toContain("경복궁");
    expect("status" in envelope.widget).toBe(false);
    expect(contentEnvelope).toEqual(envelope);
    expect(result.structuredContent.status).toBe("SUCCESS");
  });

  it.each<[VisitAssessmentStatus, string]>([
    ["LIKELY_ACCESSIBLE", "🟢 방문하기 괜찮아요"],
    ["ACCESSIBLE_WITH_CAUTION", "🟠 주의해서 방문해요"],
    ["CHECK_REQUIRED", "🟡 방문 전에 확인해요"],
    ["INSUFFICIENT_DATA", "⚪ 정보가 부족해요"],
  ])("maps %s to a user-friendly overall label", (status, label) => {
    const assessment = createAssessment();
    assessment.overallAssessment.status = status;

    expect(buildAccessibleVisitWidgetEnvelope(assessment).copy_text).toContain(label);
  });

  it("maps weather risk to traveler-specific preparation items", () => {
    const wheelchairAssessment = createAssessment();
    const strollerAssessment = createAssessment();
    strollerAssessment.visit.travelerType = "STROLLER";

    expect(buildPreparationItems(wheelchairAssessment)).toEqual(
      expect.arrayContaining(["🧥 우비를 챙겨요", "🛡️ 휠체어 방수커버를 챙겨요"]),
    );
    expect(buildPreparationItems(strollerAssessment)).toEqual(
      expect.arrayContaining(["☂️ 우산을 챙겨요", "🛡️ 유모차 레인커버를 챙겨요"]),
    );
  });

  it("maps festival risk to crowd guidance and an action", () => {
    const assessment = createAssessment();
    const widgetText = collectText(buildAccessibleVisitWidgetEnvelope(assessment).widget);

    expect(widgetText).toContain("혼잡할 가능성이 높아요");
    expect(widgetText).toContain("행사 시간과 이동 경로를 확인해요");
    expect(buildPreparationItems(assessment)).toContain("🕐 행사 시간과 이동 경로를 확인해요");
  });

  it("selects important facilities for wheelchair and stroller travelers", () => {
    const wheelchairText = collectText(
      buildAccessibleVisitWidgetEnvelope(createAssessment()).widget,
    );
    const strollerAssessment = createAssessment();
    strollerAssessment.visit.travelerType = "STROLLER";
    const strollerText = collectText(buildAccessibleVisitWidgetEnvelope(strollerAssessment).widget);

    expect(wheelchairText).toContain("장애인 화장실이 있어요");
    expect(strollerText).toContain("유모차 대여가 가능해요");
    expect(strollerText).toContain("수유실이 있어요");
  });

  it("does not present NOT_PROVIDED facilities as confirmed", () => {
    const assessment = createAssessment();
    assessment.accessibility.facilities.route = { status: "NOT_PROVIDED" };
    const widgetText = collectText(buildAccessibleVisitWidgetEnvelope(assessment).widget);

    expect(widgetText).toContain("접근로 확인이 필요해요");
    expect(widgetText).not.toContain("접근로가 확인돼요");
  });

  it("does not describe UNKNOWN charger status as currently available", () => {
    const widgetText = collectText(buildAccessibleVisitWidgetEnvelope(createAssessment()).widget);

    expect(widgetText).toContain("주변 충전소 3곳이에요");
    expect(widgetText).not.toContain("현재 사용할 수 있어요");
  });

  it("deduplicates preparation items and limits them to three", () => {
    const assessment = createAssessment();
    assessment.weather.risk.riskTypes = ["HEAVY_RAIN", "RAIN", "HEAT"];
    const items = buildPreparationItems(assessment);

    expect(items).toHaveLength(3);
    expect(new Set(items).size).toBe(items.length);
  });

  it("returns only the summary without detail content", () => {
    const widget = buildAccessibleVisitWidgetEnvelope(createAssessment()).widget;
    const widgetText = collectText(widget);

    expect(collectNodesByType(widget, "Card")).toHaveLength(1);
    expect(widget.key).toBe("accessible-visit-summary");
    expect(widgetText).not.toContain("상세 정보");
    expect("collapsed" in widget).toBe(false);
  });

  it("uses a large Card for the next width comparison", () => {
    const widget = buildAccessibleVisitWidgetEnvelope(createAssessment()).widget;

    expect(widget.size).toBe("lg");
  });

  it("keeps the previously rendered Row and Col summary structure", () => {
    const envelope = buildAccessibleVisitWidgetEnvelope(createAssessment());
    const boxes = collectNodesByType(envelope.widget, "Box");
    const rows = collectNodesByType(envelope.widget, "Row");
    const columns = collectNodesByType(envelope.widget, "Col");

    expect(boxes).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(columns).toHaveLength(5);
    expect(rows.every((row) => onlyHasKeys(row, rowKeys))).toBe(true);
    expect(columns.every((column) => column.flex === 1)).toBe(true);
    expect(columns.every((column) => column.align === "stretch")).toBe(true);
    expect(columns.every((column) => Array.isArray(column.children))).toBe(true);
  });

  it("keeps actual Text children in each summary Col without width properties", () => {
    const widget = buildAccessibleVisitWidgetEnvelope(createAssessment()).widget;
    const columns = collectNodesByType(widget, "Col");

    expect(columns).not.toHaveLength(0);
    for (const column of columns) {
      const children = Array.isArray(column.children) ? column.children : [];
      const texts = children.filter(
        (child: unknown): child is Record<string, unknown> =>
          typeof child === "object" && child !== null && "type" in child && child.type === "Text",
      );

      expect(texts).not.toHaveLength(0);
      expect(texts.every((textNode) => !("width" in textNode))).toBe(true);
      expect(texts.every((textNode) => !("textAlign" in textNode))).toBe(true);
      expect(texts.every((textNode) => !("maxLines" in textNode))).toBe(true);
    }
  });

  it("does not generate experimental responsive layout properties", () => {
    const serialized = JSON.stringify(buildAccessibleVisitWidgetEnvelope(createAssessment()));

    expect(serialized).not.toContain('"wrap"');
    expect(serialized).not.toContain('"minWidth"');
    expect(serialized).not.toContain('"textAlign"');
  });

  it("does not apply maxLines to every Text node", () => {
    const texts = collectNodesByType(
      buildAccessibleVisitWidgetEnvelope(createAssessment()).widget,
      "Text",
    );

    expect(texts).not.toHaveLength(0);
    expect(texts.every((textNode) => !("maxLines" in textNode))).toBe(true);
  });

  it("creates a status Badge with a label and color", () => {
    const envelope = buildAccessibleVisitWidgetEnvelope(createAssessment());
    const badges = collectNodesByType(envelope.widget, "Badge");

    expect(badges).toEqual([
      expect.objectContaining({
        label: "주의해서 방문해요",
        color: "warning",
        variant: "soft",
      }),
    ]);
  });

  it("prioritizes route and elevator for wheelchair movement", () => {
    const widgetText = collectText(buildAccessibleVisitWidgetEnvelope(createAssessment()).widget);

    expect(widgetText).toContain("접근로가 확인돼요");
    expect(widgetText).toContain("엘리베이터 확인이 필요해요");
    expect(widgetText).not.toContain("출입구가 확인돼요");
  });

  it("keeps weather, festival, and charger summaries", () => {
    const widgetText = collectText(buildAccessibleVisitWidgetEnvelope(createAssessment()).widget);

    expect(widgetText).toContain("강한 비에 주의해요");
    expect(widgetText).toContain("방문일 주변 행사 2개예요");
    expect(widgetText).toContain("주변 충전소 3곳이에요");
  });

  it("uses short natural facility wording in the summary", () => {
    const assessment = createAssessment();
    assessment.accessibility.facilities.restroom = {
      status: "CONFIRMED",
      description: "장애인 화장실 있음",
    };
    const widgetText = collectText(buildAccessibleVisitWidgetEnvelope(assessment).widget);

    expect(widgetText).toContain("장애인 화장실이 있어요");
    expect(widgetText).not.toContain("있음라고");
  });

  it("can be serialized and parsed as JSON", () => {
    const envelope = buildAccessibleVisitWidgetEnvelope(createAssessment());

    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
  });

  it("falls back to the original text result when widget building fails", () => {
    const loggedErrors: unknown[] = [];
    const result = createWidgetToolResult(
      { status: "SUCCESS", destination: "경복궁" },
      {
        buildEnvelope: () => {
          throw new Error("widget test failure");
        },
        fallbackText: "경복궁 방문 정보를 확인해요",
        logError: (error) => loggedErrors.push(error),
      },
    );

    expect(result.structuredContent).toEqual({ status: "SUCCESS", destination: "경복궁" });
    expect(result.content[0]?.text).toBe("경복궁 방문 정보를 확인해요");
    expect(loggedErrors).toHaveLength(1);
  });
});

function createAssessment(): AccessibleVisitAssessment {
  const destination = {
    name: "경복궁",
    contentId: "126508",
    contentTypeId: "12",
    address: "서울특별시 종로구 사직로 161",
    coordinates: { latitude: 37.5796, longitude: 126.977 },
  };

  return {
    destination,
    visit: { date: "2026-08-15", travelerType: "POWER_WHEELCHAIR", radiusKm: 3 },
    overallAssessment: {
      status: "ACCESSIBLE_WITH_CAUTION",
      reasons: ["방문 전에 날씨와 행사 정보를 확인하세요."],
    },
    accessibility: {
      status: "SUCCESS",
      destination,
      travelerType: "POWER_WHEELCHAIR",
      facilities: {
        parking: { status: "CONFIRMED", description: "장애인 주차장이 있음" },
        route: { status: "CONFIRMED", description: "접근 가능한 경로가 있음" },
        entrance: { status: "CONFIRMED", description: "주출입구 접근 가능" },
        elevator: { status: "NOT_PROVIDED" },
        restroom: { status: "CONFIRMED", description: "장애인 화장실이 있음" },
        wheelchairRental: { status: "NOT_PROVIDED" },
        stroller: { status: "CONFIRMED", description: "유모차 대여 가능" },
        lactationRoom: { status: "CONFIRMED", description: "수유실이 있음" },
      },
      cautions: [],
      unknowns: ["엘리베이터"],
    },
    weather: {
      status: "AVAILABLE",
      destination,
      visitDate: "2026-08-15",
      travelerType: "POWER_WHEELCHAIR",
      forecasts: [
        {
          forecastDate: "2026-08-15",
          minTemperatureCelsius: 25,
          maxTemperatureCelsius: 31,
          maxPrecipitationProbabilityPercent: 80,
          maxPrecipitationAmountMm: 30,
          precipitationTypes: ["RAIN"],
        },
      ],
      risk: {
        riskLevel: "HIGH",
        riskTypes: ["HEAVY_RAIN", "RAIN"],
        cautions: ["강한 비에 주의하세요."],
      },
    },
    chargers: {
      status: "SUCCESS",
      destination,
      chargers: [
        { name: "광화문 충전소", distanceKm: 0.4, realtimeAvailability: "UNKNOWN" },
        { name: "종로 충전소", distanceKm: 0.9, realtimeAvailability: "UNKNOWN" },
        { name: "시청 충전소", distanceKm: 1.2, realtimeAvailability: "UNKNOWN" },
      ],
      cautions: ["실시간 상태는 확인할 수 없습니다."],
    },
    festivalRisk: {
      status: "SUCCESS",
      destination,
      visitDate: "2026-08-15",
      radiusKm: 3,
      riskLevel: "HIGH",
      festivals: [
        { id: "festival-1", name: "궁중문화축전", distanceKm: 0.4 },
        { id: "festival-2", name: "광화문 문화행사", distanceKm: 1.2 },
      ],
      cautions: ["행사 시간과 이동 경로를 확인하세요."],
    },
    combinedCautions: [],
    unknowns: ["엘리베이터"],
    checklist: [],
    phoneCheckQuestions: [],
  };
}

function collectText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(collectText).join("\n");
  }
  if (typeof value !== "object" || value === null) {
    return "";
  }
  const record = value as Record<string, unknown>;
  const current =
    typeof record.value === "string"
      ? record.value
      : typeof record.label === "string"
        ? record.label
        : "";
  return [current, collectText(record.children)].filter((item) => item.length > 0).join("\n");
}

function collectNodesByType(value: unknown, type: string): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNodesByType(item, type));
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const record = value as Record<string, unknown>;
  return [...(record.type === type ? [record] : []), ...collectNodesByType(record.children, type)];
}

const rowKeys = new Set(["type", "gap", "align", "children"]);

function onlyHasKeys(value: Record<string, unknown>, allowedKeys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowedKeys.has(key));
}
