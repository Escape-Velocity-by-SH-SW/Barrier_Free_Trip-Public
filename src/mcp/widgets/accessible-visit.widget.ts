import type {
  AccessibilityFacilities,
  EvidenceItem,
  TravelerType,
} from "../../domain/accessibility.js";
import type { ChargerSummary } from "../../domain/charger.js";
import type { NearbyFestival } from "../../domain/festival.js";
import type {
  AccessibleVisitAssessment,
  VisitAssessmentStatus,
} from "../../domain/visit-assessment.js";
import type {
  DailyWeatherForecast,
  PrecipitationType,
  WeatherRiskType,
} from "../../domain/weather.js";
import type {
  BadgeWidgetNode,
  CardWidgetRoot,
  KakaoWidgetEnvelope,
  TextWidgetNode,
  WidgetNode,
} from "./widget-types.js";

type FacilityKey = keyof AccessibilityFacilities;

const maxPreparationItems = 4;
const maxFestivalItems = 3;
const maxFacilityItems = 5;

const overallLabels: Readonly<Record<VisitAssessmentStatus, string>> = {
  LIKELY_ACCESSIBLE: "🟢 방문하기 괜찮아요",
  ACCESSIBLE_WITH_CAUTION: "🟠 주의해서 방문해요",
  CHECK_REQUIRED: "🟡 방문 전에 확인해요",
  INSUFFICIENT_DATA: "⚪ 정보가 부족해요",
};

const overallBadges: Readonly<
  Record<VisitAssessmentStatus, Pick<BadgeWidgetNode, "label" | "color">>
> = {
  LIKELY_ACCESSIBLE: { label: "방문하기 괜찮아요", color: "success" },
  ACCESSIBLE_WITH_CAUTION: { label: "주의해서 방문해요", color: "warning" },
  CHECK_REQUIRED: { label: "방문 전에 확인해요", color: "warning" },
  INSUFFICIENT_DATA: { label: "정보가 부족해요", color: "secondary" },
};

const travelerLabels: Readonly<Record<TravelerType, string>> = {
  POWER_WHEELCHAIR: "전동휠체어",
  MANUAL_WHEELCHAIR: "수동휠체어",
  STROLLER: "유모차",
  ELDERLY_COMPANION: "고령자 동반",
};

const facilityLabels: Readonly<Record<FacilityKey, string>> = {
  parking: "장애인 주차장",
  route: "접근로",
  entrance: "출입구",
  elevator: "엘리베이터",
  restroom: "장애인 화장실",
  wheelchairRental: "휠체어 대여",
  stroller: "유모차 대여",
  lactationRoom: "수유실",
};

const facilityPriorities: Readonly<Record<TravelerType, FacilityKey[]>> = {
  POWER_WHEELCHAIR: ["route", "entrance", "elevator", "restroom", "parking", "wheelchairRental"],
  MANUAL_WHEELCHAIR: ["route", "entrance", "elevator", "restroom", "parking", "wheelchairRental"],
  STROLLER: ["route", "entrance", "elevator", "stroller", "lactationRoom", "restroom"],
  ELDERLY_COMPANION: ["route", "entrance", "elevator", "restroom", "parking"],
};

const weatherRiskPriority: WeatherRiskType[] = [
  "HEAVY_RAIN",
  "ICY_ROAD",
  "SNOW",
  "HEAT",
  "COLD",
  "RAIN",
];

export function buildAccessibleVisitWidgetEnvelope(
  assessment: AccessibleVisitAssessment,
): KakaoWidgetEnvelope {
  return {
    widget: buildVisitSummary(assessment),
    copy_text: buildAccessibleVisitCopyText(assessment),
  };
}

/** Kakao Preview에서 검증된 단일 Card(size=lg) SUMMARY Widget을 만든다. */
export function buildVisitSummary(assessment: AccessibleVisitAssessment): CardWidgetRoot {
  const children: WidgetNode[] = [title(assessment.destination.name, "xl")];
  if (assessment.destination.address !== undefined) {
    children.push(caption(assessment.destination.address));
  }
  children.push(
    caption(
      `${formatVisitDate(assessment.visit.date)} · ${travelerLabels[assessment.visit.travelerType]}`,
    ),
    divider(),
    badge(assessment.overallAssessment.status),
    text(preventKoreanWordBreak(buildOverallReason(assessment)), "md"),
    divider(),
    title("이동 · 무장애 편의", "md"),
    ...buildAccessibilitySummary(assessment),
  );

  // 날씨 조회 자체가 FAILED면 실패 안내를 보여주는 대신 날씨 섹션을 통째로 뺀다.
  if (assessment.weather.status !== "FAILED") {
    children.push(divider(), title("방문일 날씨", "md"), ...buildWeatherSummary(assessment));
  }

  children.push(divider(), title("주변 문화축제", "md"), ...buildFestivalSummary(assessment));

  if (assessment.visit.travelerType === "POWER_WHEELCHAIR") {
    children.push(divider(), title("전동휠체어 충전소", "md"), ...buildChargerSummary(assessment));
  }

  children.push(
    divider(),
    title("출발 전에 확인해요", "md"),
    ...buildPreparationItems(assessment).map((item) => text(`• ${item}`, "sm")),
  );

  return {
    type: "Card",
    size: "lg",
    padding: 12,
    key: "accessible-visit-summary",
    children,
  };
}

export function buildPreparationItems(assessment: AccessibleVisitAssessment): string[] {
  const items: string[] = [];
  addAccessibilityPreparation(items, assessment);
  addWeatherPreparation(items, assessment);

  if (assessment.festivalRisk.festivals.length > 0) {
    items.push("축제 시간 · 주변 이동 동선 확인");
  }

  if (assessment.visit.travelerType === "POWER_WHEELCHAIR") {
    items.push(
      assessment.chargers.chargers.length > 0
        ? "이용할 충전소 실제 작동 여부 확인"
        : "대체 충전 계획과 방문지 충전 가능 여부 확인",
    );
  }

  items.push("방문 당일 공식 예보 재확인");
  const uniqueItems = uniqueStrings(items);
  if (uniqueItems.length < 2) {
    uniqueItems.push("방문지 운영 공지와 이동 동선 확인");
  }
  return uniqueItems.slice(0, maxPreparationItems);
}

function buildAccessibilitySummary(assessment: AccessibleVisitAssessment): WidgetNode[] {
  return facilityPriorities[assessment.visit.travelerType]
    .slice(0, maxFacilityItems)
    .map((key) => text(`• ${formatFacility(key, assessment.accessibility.facilities[key])}`, "sm"));
}

function formatFacility(key: FacilityKey, evidence: EvidenceItem): string {
  const label = facilityLabels[key];
  if (evidence.status === "NOT_PROVIDED") return `${label} · 정보 미제공`;
  if (evidence.status === "CONFLICTING") return `${label} · 제공 정보가 서로 달라 확인 필요`;
  if (evidence.status === "NOT_AVAILABLE") {
    return evidence.description === undefined
      ? `${label} · 이용 불가로 안내됨`
      : `${label} · ${normalizeDescription(evidence.description)}`;
  }
  if (evidence.description !== undefined) {
    return `${label} · ${normalizeDescription(evidence.description)}`;
  }
  return `${label} · 관련 정보 확인됨`;
}

function buildWeatherSummary(assessment: AccessibleVisitAssessment): WidgetNode[] {
  const forecast = selectVisitForecast(assessment.weather.forecasts, assessment.visit.date);
  if (forecast === undefined) {
    return [text(formatWeatherDataStatus(assessment.weather.status), "sm")];
  }

  const lines = [
    formatTemperature(forecast),
    forecast.maxPrecipitationProbabilityPercent !== undefined
      ? `강수확률 ${forecast.maxPrecipitationProbabilityPercent}%`
      : undefined,
    formatPrecipitationTypes(forecast.precipitationTypes),
    formatPrecipitationAmount(forecast),
    formatWeatherRisks(assessment.weather.risk.riskTypes),
  ].filter((line): line is string => line !== undefined);

  return lines.length > 0
    ? lines.map((line) => text(`• ${line}`, "sm"))
    : [text("제공된 예보 수치가 없어요", "sm")];
}

function formatTemperature(forecast: DailyWeatherForecast): string | undefined {
  const minimum = forecast.minTemperatureCelsius;
  const maximum = forecast.maxTemperatureCelsius;
  if (minimum !== undefined && maximum !== undefined) return `${minimum}° / ${maximum}°`;
  if (minimum !== undefined) return `최저 ${minimum}°`;
  if (maximum !== undefined) return `최고 ${maximum}°`;
  return undefined;
}

function formatPrecipitationTypes(types: PrecipitationType[]): string | undefined {
  const labels = uniqueStrings(
    types.flatMap((type) => {
      if (type === "RAIN") return ["비"];
      if (type === "RAIN_SNOW") return ["비·눈"];
      if (type === "SNOW") return ["눈"];
      if (type === "SHOWER") return ["소나기"];
      if (type === "UNKNOWN") return ["강수형태 미확인"];
      return [];
    }),
  );
  return labels.length > 0 ? `${labels.join(" · ")} 예보` : undefined;
}

function formatPrecipitationAmount(forecast: DailyWeatherForecast): string | undefined {
  if (forecast.precipitationAmountDescription !== undefined) {
    if (forecast.precipitationAmountDescription === "강수없음") {
      return undefined;
    }
    return `강수량 ${forecast.precipitationAmountDescription}`;
  }
  if (forecast.maxPrecipitationAmountMm !== undefined && forecast.maxPrecipitationAmountMm > 0) {
    return `최대 1시간 강수량 ${forecast.maxPrecipitationAmountMm}mm`;
  }
  return undefined;
}

function formatWeatherRisks(riskTypes: WeatherRiskType[]): string | undefined {
  const primaryRisk = selectPrimaryWeatherRisk(riskTypes);
  if (primaryRisk === undefined) return undefined;
  const labels: Readonly<Record<WeatherRiskType, string>> = {
    HEAT: "폭염 주의",
    COLD: "한파 주의",
    RAIN: "비로 인한 미끄럼 주의",
    HEAVY_RAIN: "강한 비 주의",
    SNOW: "눈길 주의",
    ICY_ROAD: "결빙 가능성 주의",
  };
  return labels[primaryRisk];
}

function formatWeatherDataStatus(status: AccessibleVisitAssessment["weather"]["status"]): string {
  if (status === "OUT_OF_RANGE") return "단기예보 범위 밖이라 예보 수치를 제공하지 않아요";
  if (status === "NO_DATA") return "방문일에 제공 가능한 단기예보 데이터가 없어요";
  if (status === "FAILED") return "날씨 정보를 조회하지 못했어요";
  return "제공된 예보 수치가 없어요";
}

function buildFestivalSummary(assessment: AccessibleVisitAssessment): WidgetNode[] {
  const festivalRisk = assessment.festivalRisk;
  const festivals = sortFestivalsByDistance(festivalRisk.festivals).slice(0, maxFestivalItems);
  const nodes: WidgetNode[] = [];

  if (festivalRisk.status === "FAILED") {
    nodes.push(text("문화축제 정보를 조회하지 못했어요", "sm"));
  } else if (festivalRisk.status === "NO_DATA") {
    nodes.push(text("방문일에 제공된 문화축제 데이터가 없어요", "sm"));
  } else if (festivals.length === 0) {
    nodes.push(
      text(`${formatDistance(festivalRisk.radiusKm)} 반경 · 공공데이터에서 확인된 축제 없음`, "sm"),
    );
  } else {
    nodes.push(
      text(
        `${formatVisitDate(festivalRisk.visitDate)} · ${formatDistance(festivalRisk.radiusKm)} 반경에서 ${festivalRisk.festivals.length}개 확인`,
        "sm",
      ),
      ...festivals.map((festival) => text(`• ${formatFestivalItem(festival)}`, "sm")),
    );
  }

  nodes.push(
    caption("공공데이터 등록 문화축제 기준 · 좌표 없는 축제는 거리 계산에서 제외될 수 있어요"),
  );
  return nodes;
}

function formatFestivalItem(festival: NearbyFestival): string {
  const distance =
    festival.distanceKm !== undefined ? ` · ${formatDistance(festival.distanceKm)}` : "";
  return `${festival.name}${distance}`;
}

function buildChargerSummary(assessment: AccessibleVisitAssessment): WidgetNode[] {
  const chargers = assessment.chargers.chargers.slice(0, 3);
  const nodes: WidgetNode[] = [];
  if (assessment.chargers.status === "FAILED") {
    nodes.push(text("충전소 위치 정보를 조회하지 못했어요", "sm"));
  } else if (chargers.length === 0) {
    nodes.push(
      text(`${formatDistance(assessment.chargers.radiusKm)} 반경에서 확인된 충전소 없음`, "sm"),
    );
  } else {
    nodes.push(...chargers.map((charger) => text(`• ${formatChargerItem(charger)}`, "sm")));
  }
  nodes.push(caption("위치 정보 기준 · 실시간 작동 상태 미제공"));
  return nodes;
}

function formatChargerItem(charger: ChargerSummary): string {
  const location = charger.installationLocationDescription?.trim();
  return `${charger.name} · ${formatDistance(charger.distanceKm)}${
    location !== undefined && location.length > 0 ? ` · ${location}` : ""
  }`;
}

function buildOverallReason(assessment: AccessibleVisitAssessment): string {
  const failedSources = getFailedSourceLabels(assessment);
  if (failedSources.length > 0) {
    return `${joinKorean(failedSources.slice(0, 2))} 정보를 조회하지 못해, 출발 전에 공식 정보나 현장 안내를 확인해 주세요.`;
  }

  const unavailableFacilities = findUnavailablePriorityFacilities(assessment);
  if (unavailableFacilities.length > 0) {
    return `공공데이터에서 ${joinKorean(unavailableFacilities.slice(0, 2))} 항목이 이용 불가 또는 미설치로 안내되어, 방문 전 대체 동선이나 시설을 확인해 주세요.`;
  }

  const unknownFacilities = findUnknownPriorityFacilities(assessment);
  if (unknownFacilities.length > 0) {
    return `공공데이터에서 ${joinKorean(unknownFacilities.slice(0, 2))} 정보를 확인할 수 없어, 방문 전 이용 가능 여부를 확인해 주세요.`;
  }

  const causes: string[] = [];
  const weatherRisk = selectPrimaryWeatherRisk(assessment.weather.risk.riskTypes);
  if (weatherRisk !== undefined) causes.push(formatWeatherCause(weatherRisk));
  if (assessment.festivalRisk.festivals.length > 0) causes.push("주변 문화축제 일정");
  if (causes.length > 0) {
    return `${withSubjectParticle(joinKorean(causes.slice(0, 2)))} 있어 이동 경로와 준비 사항을 확인해 주세요.`;
  }

  const overallReason = assessment.overallAssessment.reasons.find(
    (reason) => reason.trim().length > 0,
  );
  if (overallReason !== undefined) {
    return overallReason;
  }

  if (assessment.overallAssessment.status === "INSUFFICIENT_DATA") {
    return "방문 가능 여부를 판단할 공공데이터가 충분하지 않아, 주요 시설과 운영 정보를 방문 전에 확인해 주세요.";
  }
  return "조회된 공공데이터에서 주요 이동 시설과 방문일 예보의 큰 위험 신호가 확인되지 않았어요.";
}

function getFailedSourceLabels(assessment: AccessibleVisitAssessment): string[] {
  const labels: string[] = [];
  if (assessment.accessibility.status === "FAILED") labels.push("무장애 편의시설");
  // 날씨는 실패 시 항목 자체를 제외하므로 "조회 실패" 사유로 노출하지 않는다.
  if (assessment.festivalRisk.status === "FAILED") labels.push("문화축제");
  if (
    assessment.visit.travelerType === "POWER_WHEELCHAIR" &&
    assessment.chargers.status === "FAILED"
  ) {
    labels.push("전동휠체어 충전소");
  }
  return labels;
}

function findUnavailablePriorityFacilities(assessment: AccessibleVisitAssessment): string[] {
  return facilityPriorities[assessment.visit.travelerType]
    .filter((key) => assessment.accessibility.facilities[key].status === "NOT_AVAILABLE")
    .map((key) => facilityLabels[key]);
}

function findUnknownPriorityFacilities(assessment: AccessibleVisitAssessment): string[] {
  return facilityPriorities[assessment.visit.travelerType]
    .filter((key) => {
      const status = assessment.accessibility.facilities[key].status;
      return status === "NOT_PROVIDED" || status === "CONFLICTING";
    })
    .map((key) => facilityLabels[key]);
}

export function buildAccessibleVisitCopyText(assessment: AccessibleVisitAssessment): string {
  const preparation = buildPreparationItems(assessment).join(" · ");
  return [
    `**${assessment.destination.name}**`,
    ...(assessment.destination.address !== undefined ? [assessment.destination.address] : []),
    `${formatVisitDate(assessment.visit.date)} · ${travelerLabels[assessment.visit.travelerType]}`,
    overallLabels[assessment.overallAssessment.status],
    buildOverallReason(assessment),
    `출발 전 확인: ${preparation}`,
  ].join("\n");
}

function addAccessibilityPreparation(items: string[], assessment: AccessibleVisitAssessment): void {
  const unknownLabels = facilityPriorities[assessment.visit.travelerType]
    .filter((key) => {
      const status = assessment.accessibility.facilities[key].status;
      return status === "NOT_PROVIDED" || status === "CONFLICTING";
    })
    .slice(0, 2)
    .map((key) => facilityLabels[key]);
  if (unknownLabels.length > 0) {
    items.push(`${unknownLabels.join(" · ")} 이용 가능 여부 확인`);
  }
}

function addWeatherPreparation(items: string[], assessment: AccessibleVisitAssessment): void {
  const riskType = selectPrimaryWeatherRisk(assessment.weather.risk.riskTypes);
  if (riskType === undefined) return;
  const travelerType = assessment.visit.travelerType;
  if (riskType === "HEAT") items.push("물 · 그늘 · 냉방 휴식 공간 준비");
  if (riskType === "COLD") items.push("방한용품과 실내 대기 장소 준비");
  if (riskType === "SNOW" || riskType === "ICY_ROAD") {
    items.push("경사로 · 보도 결빙 상태 확인");
  }
  if (riskType === "RAIN" || riskType === "HEAVY_RAIN") {
    items.push(
      travelerType === "POWER_WHEELCHAIR" || travelerType === "MANUAL_WHEELCHAIR"
        ? "우비 · 휠체어 방수커버 준비"
        : travelerType === "STROLLER"
          ? "우비 · 유모차 레인커버 준비"
          : "우산 · 우비 준비",
    );
  }
}

function selectVisitForecast(
  forecasts: DailyWeatherForecast[],
  visitDate: string,
): DailyWeatherForecast | undefined {
  return forecasts.find((forecast) => forecast.forecastDate === visitDate);
}

function selectPrimaryWeatherRisk(riskTypes: WeatherRiskType[]): WeatherRiskType | undefined {
  return weatherRiskPriority.find((riskType) => riskTypes.includes(riskType));
}

function formatWeatherCause(riskType: WeatherRiskType): string {
  const causes: Readonly<Record<WeatherRiskType, string>> = {
    HEAT: "폭염 수준 기온",
    COLD: "한파 수준 기온",
    RAIN: "비 예보",
    HEAVY_RAIN: "강한 비 예보",
    SNOW: "눈 예보",
    ICY_ROAD: "노면 결빙 가능성",
  };
  return causes[riskType];
}

function sortFestivalsByDistance(festivals: NearbyFestival[]): NearbyFestival[] {
  return festivals.toSorted(
    (left, right) =>
      (left.distanceKm ?? Number.POSITIVE_INFINITY) -
      (right.distanceKm ?? Number.POSITIVE_INFINITY),
  );
}

function badge(status: VisitAssessmentStatus): BadgeWidgetNode {
  return {
    type: "Badge",
    ...overallBadges[status],
    variant: "soft",
    size: "md",
  };
}

function title(value: string, size: "md" | "xl"): WidgetNode {
  return { type: "Title", value, size, weight: "bold" };
}

function text(
  value: string,
  size: "sm" | "md",
  weight: TextWidgetNode["weight"] = "normal",
): TextWidgetNode {
  return { type: "Text", value, size, weight };
}

function caption(value: string): WidgetNode {
  return { type: "Caption", value, size: "sm", color: "#667085" };
}

function divider(): WidgetNode {
  return { type: "Divider", spacing: 8, color: "#E4E7EC" };
}

function formatVisitDate(visitDate: string): string {
  const [, month = visitDate, day = ""] = visitDate.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.max(1, Math.round(distanceKm * 1000))}m`;
  }
  return `${Math.round(distanceKm * 10) / 10}km`;
}

function normalizeDescription(value: string): string {
  return value.trim().replaceAll(/[.!?。]+$/g, "");
}

/** 한글 단어 내부의 음절 단위 줄바꿈을 막고 공백에서 줄바꿈되도록 한다. */
function preventKoreanWordBreak(value: string): string {
  return value.replaceAll(/([가-힣])(?=[가-힣])/g, `$1\u2060`);
}

function joinKorean(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  const first = values[0] ?? "";
  return `${first}${hasKoreanFinalConsonant(first) ? "과" : "와"} ${values[1]}`;
}

function withSubjectParticle(value: string): string {
  return `${value}${hasKoreanFinalConsonant(value) ? "이" : "가"}`;
}

function hasKoreanFinalConsonant(value: string): boolean {
  const lastCharacter = [...value.trim()].at(-1);
  if (lastCharacter === undefined) return false;
  const codePoint = lastCharacter.codePointAt(0);
  if (codePoint === undefined || codePoint < 0xac00 || codePoint > 0xd7a3) return false;
  return (codePoint - 0xac00) % 28 !== 0;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
