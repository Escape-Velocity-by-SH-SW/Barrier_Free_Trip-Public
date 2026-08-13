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
import type { DailyWeatherForecast, WeatherRiskType } from "../../domain/weather.js";
import type {
  BadgeWidgetNode,
  CardWidgetRoot,
  ColWidgetNode,
  KakaoWidgetEnvelope,
  TextWidgetNode,
  WidgetNode,
} from "./widget-types.js";

type FacilityKey = keyof AccessibilityFacilities;

const maxPreparationItems = 3;
const maxFestivalItems = 3;

const overallLabels: Record<VisitAssessmentStatus, string> = {
  LIKELY_ACCESSIBLE: "🟢 방문하기 괜찮아요",
  ACCESSIBLE_WITH_CAUTION: "🟠 주의해서 방문해요",
  CHECK_REQUIRED: "🟡 방문 전에 확인해요",
  INSUFFICIENT_DATA: "⚪ 정보가 부족해요",
};

const overallBadges: Record<VisitAssessmentStatus, Pick<BadgeWidgetNode, "label" | "color">> = {
  LIKELY_ACCESSIBLE: { label: "방문하기 괜찮아요", color: "success" },
  ACCESSIBLE_WITH_CAUTION: { label: "주의해서 방문해요", color: "warning" },
  CHECK_REQUIRED: { label: "방문 전에 확인해요", color: "warning" },
  INSUFFICIENT_DATA: { label: "정보가 부족해요", color: "secondary" },
};

const travelerLabels: Record<TravelerType, string> = {
  POWER_WHEELCHAIR: "전동휠체어",
  MANUAL_WHEELCHAIR: "수동휠체어",
  STROLLER: "유모차",
  ELDERLY_COMPANION: "고령자 동반",
};

const facilityLabels: Record<FacilityKey, string> = {
  parking: "장애인 주차장",
  route: "접근로",
  entrance: "출입구",
  elevator: "엘리베이터",
  restroom: "장애인 화장실",
  wheelchairRental: "휠체어 대여",
  stroller: "유모차 대여",
  lactationRoom: "수유실",
};

const facilitySummaryLabels: Record<FacilityKey, string> = {
  parking: "주차장",
  route: "접근로",
  entrance: "출입구",
  elevator: "엘리베이터",
  restroom: "화장실",
  wheelchairRental: "휠체어 대여",
  stroller: "유모차 대여",
  lactationRoom: "수유실",
};

const movementPriorities: Record<TravelerType, FacilityKey[]> = {
  POWER_WHEELCHAIR: ["route", "elevator", "entrance"],
  MANUAL_WHEELCHAIR: ["route", "elevator", "entrance"],
  STROLLER: ["route", "entrance", "elevator"],
  ELDERLY_COMPANION: ["route", "entrance", "elevator"],
};

const conveniencePriorities: Record<TravelerType, FacilityKey[]> = {
  POWER_WHEELCHAIR: ["restroom", "parking", "wheelchairRental"],
  MANUAL_WHEELCHAIR: ["restroom", "parking", "wheelchairRental"],
  STROLLER: ["stroller", "lactationRoom", "elevator"],
  ELDERLY_COMPANION: ["restroom", "parking", "elevator"],
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
    widget: {
      type: "Basic",
      children: [buildVisitSummary(assessment), buildVisitDetails(assessment)],
    },
    copy_text: buildAccessibleVisitCopyText(assessment),
  };
}

export function buildVisitSummary(assessment: AccessibleVisitAssessment): CardWidgetRoot {
  const preparationItems = buildPreparationItems(assessment);
  const children: WidgetNode[] = [
    title(assessment.destination.name, "xl"),
    caption(
      `${formatVisitDate(assessment.visit.date)} · ${travelerLabels[assessment.visit.travelerType]}`,
    ),
    divider(),
    badge(assessment.overallAssessment.status),
    text(buildOverallReason(assessment), "md"),
    divider(),
    title("한눈에 보기", "md"),
    ...buildOverviewRows(assessment),
    divider(),
    title("챙기거나 확인해요", "md"),
    ...preparationItems.map((item) => text(item, "sm")),
  ];

  return {
    type: "Card",
    size: "lg",
    padding: 16,
    key: "accessible-visit-summary",
    children,
  };
}

export function buildVisitDetails(assessment: AccessibleVisitAssessment): CardWidgetRoot {
  return {
    type: "Card",
    size: "lg",
    padding: 16,
    key: "accessible-visit-details",
    collapsed: true,
    children: [
      title("상세 정보", "md"),
      divider(),
      ...buildAccessibilityDetails(assessment),
      divider(),
      ...buildWeatherDetails(assessment),
      divider(),
      ...buildFestivalDetails(assessment),
      divider(),
      ...buildChargerDetails(assessment),
    ],
  };
}

export function buildPreparationItems(assessment: AccessibleVisitAssessment): string[] {
  const items = new Set<string>();
  const primaryWeatherRisk = selectPrimaryWeatherRisk(assessment.weather.risk.riskTypes);
  if (primaryWeatherRisk !== undefined) {
    addWeatherPreparation(items, primaryWeatherRisk, assessment.visit.travelerType);
  }
  if (
    assessment.festivalRisk.riskLevel === "HIGH" ||
    assessment.festivalRisk.riskLevel === "MEDIUM"
  ) {
    items.add("🕐 행사 시간과 이동 경로 확인");
  }
  addAccessibilityPreparation(items, assessment);
  if (items.size === 0) {
    items.add("🧭 방문 전 이동 경로 확인");
  }
  return [...items].slice(0, maxPreparationItems);
}

function buildOverviewRows(assessment: AccessibleVisitAssessment): WidgetNode[] {
  const movement = buildFacilitySummary(
    "♿ 이동",
    movementPriorities[assessment.visit.travelerType],
    assessment.accessibility.facilities,
  );
  const convenience = buildFacilitySummary(
    "🚻 편의시설",
    conveniencePriorities[assessment.visit.travelerType],
    assessment.accessibility.facilities,
  );
  const weather = buildWeatherSummary(assessment);
  const festival = buildFestivalSummary(assessment);
  const rows: WidgetNode[] = [summaryRow(movement, convenience), summaryRow(weather, festival)];
  if (assessment.visit.travelerType === "POWER_WHEELCHAIR") {
    rows.push(buildChargerSummary(assessment));
  }
  return rows;
}

function buildFacilitySummary(
  heading: string,
  priorities: FacilityKey[],
  facilities: AccessibilityFacilities,
): ColWidgetNode {
  const selected = priorities.slice(0, 2);
  return summaryBox(
    heading,
    selected.map((key) => formatFacilitySummary(key, facilities[key])),
  );
}

function buildWeatherSummary(assessment: AccessibleVisitAssessment): ColWidgetNode {
  const riskType = selectPrimaryWeatherRisk(assessment.weather.risk.riskTypes);
  const forecast = selectVisitForecast(assessment.weather.forecasts, assessment.visit.date);
  const heading = `${getWeatherIcon(riskType)} 날씨`;
  return summaryBox(heading, [
    formatWeatherRisk(riskType),
    formatWeatherMetric(riskType, forecast),
  ]);
}

function buildFestivalSummary(assessment: AccessibleVisitAssessment): ColWidgetNode {
  const count = assessment.festivalRisk.festivals.length;
  return summaryBox("👥 주변 혼잡", [
    formatFestivalRisk(assessment.festivalRisk.riskLevel),
    count > 0 ? `주변 행사 ${count}개` : "주변 행사 없음",
  ]);
}

function buildChargerSummary(assessment: AccessibleVisitAssessment): ColWidgetNode {
  const chargers = assessment.chargers.chargers;
  const lines = [formatChargerCount(assessment.chargers.status, chargers.length)];
  const nearest = selectNearestCharger(chargers);
  if (nearest !== undefined) {
    lines.push(`가까운 곳 ${formatDistance(nearest.distanceKm)}`);
  }
  return summaryBox("🔋 충전", lines);
}

function buildAccessibilityDetails(assessment: AccessibleVisitAssessment): WidgetNode[] {
  const priorities = uniqueFacilities([
    ...movementPriorities[assessment.visit.travelerType],
    ...conveniencePriorities[assessment.visit.travelerType],
  ]).slice(0, 5);
  return [
    title("이동과 편의시설", "md"),
    ...priorities.flatMap((key) => [
      text(`• ${facilityLabels[key]}`, "sm", "semibold"),
      text(formatFacilityDetail(key, assessment.accessibility.facilities[key]), "sm"),
    ]),
  ];
}

function buildWeatherDetails(assessment: AccessibleVisitAssessment): WidgetNode[] {
  const riskType = selectPrimaryWeatherRisk(assessment.weather.risk.riskTypes);
  const forecast = selectVisitForecast(assessment.weather.forecasts, assessment.visit.date);
  const preparation = buildPreparationItems(assessment).filter((item) => !item.includes("행사"));
  return [
    title("날씨", "md"),
    text(`${getWeatherIcon(riskType)} ${formatWeatherRisk(riskType)}`, "sm", "semibold"),
    text(formatWeatherMetric(riskType, forecast), "sm"),
    ...(preparation[0] !== undefined ? [text(preparation[0], "sm")] : []),
  ];
}

function buildFestivalDetails(assessment: AccessibleVisitAssessment): WidgetNode[] {
  const festivalCount = assessment.festivalRisk.festivals.length;
  const festivals = sortFestivalsByDistance(assessment.festivalRisk.festivals).slice(
    0,
    maxFestivalItems,
  );
  const nodes: WidgetNode[] = [
    title("주변 행사 · 혼잡", "md"),
    text(`👥 ${formatFestivalRisk(assessment.festivalRisk.riskLevel)}`, "sm", "semibold"),
    text(formatFestivalCount(festivalCount), "sm"),
    ...festivals.map((festival) => text(formatFestivalItem(festival), "sm")),
  ];
  if (
    assessment.festivalRisk.riskLevel === "HIGH" ||
    assessment.festivalRisk.riskLevel === "MEDIUM"
  ) {
    nodes.push(text("행사 시간과 이동 경로를 미리 확인해요", "sm"));
  }
  return nodes;
}

function buildChargerDetails(assessment: AccessibleVisitAssessment): WidgetNode[] {
  if (assessment.visit.travelerType !== "POWER_WHEELCHAIR") {
    return [
      title("충전", "md"),
      text("현재 이동 조건에서는 충전 정보를 우선 표시하지 않아요", "sm"),
    ];
  }
  const chargers = assessment.chargers.chargers;
  const nearest = selectNearestCharger(chargers);
  return [
    title("충전", "md"),
    text(`🔋 ${formatChargerCount(assessment.chargers.status, chargers.length)}`, "sm", "semibold"),
    ...(nearest !== undefined
      ? [text(`가장 가까운 곳은 약 ${formatDistance(nearest.distanceKm)}예요`, "sm")]
      : []),
    text("충전소의 실시간 상태는 제공되지 않아요", "sm"),
  ];
}

function buildOverallReason(assessment: AccessibleVisitAssessment): string {
  if (assessment.overallAssessment.status === "LIKELY_ACCESSIBLE") {
    return "현재 확인된 정보에서는 큰 위험 신호가 많지 않아요";
  }

  if (assessment.overallAssessment.status === "INSUFFICIENT_DATA") {
    return "확인된 정보가 부족해 방문 전에 한 번 더 확인하는 게 좋아요";
  }

  if (assessment.overallAssessment.status === "CHECK_REQUIRED") {
    if (hasFailedSource(assessment)) {
      return "일부 방문 정보를 확인하기 어려워 출발 전에 다시 확인하는 게 좋아요";
    }

    const unknownFacilities = findUnknownPriorityFacilities(assessment);
    if (unknownFacilities.length > 0) {
      return `${joinKorean(unknownFacilities.slice(0, 2))} 정보를 확인하기 어려워 방문 전에 한 번 더 확인하는 게 좋아요`;
    }

    return "일부 정보를 확인하기 어려워 방문 전에 한 번 더 확인하는 게 좋아요";
  }

  const causes: string[] = [];
  const weatherRisk = selectPrimaryWeatherRisk(assessment.weather.risk.riskTypes);
  if (weatherRisk !== undefined) {
    causes.push(formatWeatherCause(weatherRisk));
  }
  if (
    assessment.festivalRisk.riskLevel === "HIGH" ||
    assessment.festivalRisk.riskLevel === "MEDIUM"
  ) {
    causes.push("주변 행사");
  }
  if (causes.length > 0) {
    return `${joinKorean(causes.slice(0, 2))} 때문에 이동할 때 조금 더 주의가 필요해요`;
  }

  const unknownFacilities = findUnknownPriorityFacilities(assessment);
  if (unknownFacilities.length > 0) {
    return `${joinKorean(unknownFacilities.slice(0, 2))} 정보를 확인하기 어려워 이동 전에 한 번 더 확인하는 게 좋아요`;
  }

  return getDefaultOverallReason(assessment.overallAssessment.status);
}

function hasFailedSource(assessment: AccessibleVisitAssessment): boolean {
  return (
    assessment.accessibility.status !== "SUCCESS" ||
    assessment.weather.status === "FAILED" ||
    assessment.festivalRisk.status === "FAILED" ||
    (assessment.visit.travelerType === "POWER_WHEELCHAIR" &&
      assessment.chargers.status === "FAILED")
  );
}

function findUnknownPriorityFacilities(assessment: AccessibleVisitAssessment): string[] {
  const priorities = uniqueFacilities([
    ...movementPriorities[assessment.visit.travelerType],
    ...conveniencePriorities[assessment.visit.travelerType],
  ]);
  return priorities
    .filter((key) => {
      const status = assessment.accessibility.facilities[key].status;
      return status === "NOT_PROVIDED" || status === "CONFLICTING";
    })
    .map((key) => facilitySummaryLabels[key]);
}

export function buildAccessibleVisitCopyText(assessment: AccessibleVisitAssessment): string {
  const preparation = buildPreparationItems(assessment).map(stripLeadingEmoji).join(" · ");
  return [
    `**${assessment.destination.name}**`,
    `${formatVisitDate(assessment.visit.date)} · ${travelerLabels[assessment.visit.travelerType]}`,
    overallLabels[assessment.overallAssessment.status],
    buildOverallReason(assessment),
    `준비: ${preparation}`,
  ].join("\n");
}

function addWeatherPreparation(
  items: Set<string>,
  riskType: WeatherRiskType,
  travelerType: TravelerType,
): void {
  const mapping = getWeatherPreparation(riskType, travelerType);
  for (const item of mapping) {
    items.add(item);
  }
}

function getWeatherPreparation(riskType: WeatherRiskType, travelerType: TravelerType): string[] {
  if (riskType === "HEAT") return ["☀️ 양산", "💧 물"];
  if (riskType === "COLD") return ["🧤 장갑", "🔥 핫팩"];
  if (riskType === "SNOW") return ["🥾 방수 신발", "🧭 이동 경로 확인"];
  if (riskType === "ICY_ROAD") return ["🧊 미끄러운 구간 확인"];
  if (riskType === "HEAVY_RAIN" && travelerType === "STROLLER") {
    return ["☂️ 우비 · 우산", "🛡️ 유모차 레인커버"];
  }
  if (riskType === "HEAVY_RAIN" && isWheelchairTraveler(travelerType)) {
    return ["☂️ 우비 · 우산", "🛡️ 휠체어 방수커버"];
  }
  return ["☂️ 우산", "🧥 우비"];
}

function addAccessibilityPreparation(
  items: Set<string>,
  assessment: AccessibleVisitAssessment,
): void {
  const priorities = uniqueFacilities([
    ...movementPriorities[assessment.visit.travelerType],
    ...conveniencePriorities[assessment.visit.travelerType],
  ]);
  const unknown = priorities.find(
    (key) => assessment.accessibility.facilities[key].status === "NOT_PROVIDED",
  );
  if (unknown !== undefined) {
    items.add(`☎️ ${facilitySummaryLabels[unknown]} 운영 여부 확인`);
  }
}

function formatFacilitySummary(key: FacilityKey, evidence: EvidenceItem): string {
  const label = facilitySummaryLabels[key];
  if (evidence.status === "CONFIRMED") return formatConfirmedFacility(key);
  if (evidence.status === "NOT_AVAILABLE") return `${label} 이용 어려워요`;
  if (evidence.status === "CONFLICTING") return `${label} 정보 확인 필요`;
  return `${label} 확인 필요`;
}

function formatFacilityDetail(key: FacilityKey, evidence: EvidenceItem): string {
  if (evidence.description !== undefined && evidence.description.trim().length > 0) {
    return formatReportedDescription(evidence.description);
  }
  return formatFacilitySummary(key, evidence);
}

function formatConfirmedFacility(key: FacilityKey): string {
  if (key === "route") return "접근로 확인돼요";
  if (key === "entrance") return "출입구 확인돼요";
  if (key === "elevator") return "엘리베이터 있어요";
  if (key === "restroom") return "화장실 있어요";
  if (key === "parking") return "주차장 확인돼요";
  if (key === "wheelchairRental") return "휠체어 대여 가능";
  if (key === "stroller") return "유모차 대여 가능";
  return "수유실이 있어요";
}

function selectPrimaryWeatherRisk(riskTypes: WeatherRiskType[]): WeatherRiskType | undefined {
  return weatherRiskPriority.find((riskType) => riskTypes.includes(riskType));
}

function formatWeatherRisk(riskType: WeatherRiskType | undefined): string {
  if (riskType === "HEAVY_RAIN") return "강한 비에 주의해요";
  if (riskType === "RAIN") return "비에 주의해요";
  if (riskType === "HEAT") return "더위에 주의해요";
  if (riskType === "COLD") return "추위에 주의해요";
  if (riskType === "SNOW") return "눈에 주의해요";
  if (riskType === "ICY_ROAD") return "미끄러운 길에 주의해요";
  return "큰 위험 없어요";
}

function formatWeatherCause(riskType: WeatherRiskType): string {
  const causes: Record<WeatherRiskType, string> = {
    HEAT: "더위",
    COLD: "추위",
    RAIN: "비",
    HEAVY_RAIN: "강한 비",
    SNOW: "눈",
    ICY_ROAD: "미끄러운 길",
  };
  return causes[riskType];
}

function formatWeatherMetric(
  riskType: WeatherRiskType | undefined,
  forecast: DailyWeatherForecast | undefined,
): string {
  if (forecast === undefined) return "예보 수치 확인 필요";
  if (riskType === "HEAT" && forecast.maxTemperatureCelsius !== undefined) {
    return `최고 ${forecast.maxTemperatureCelsius}°C`;
  }
  if (riskType === "COLD" && forecast.minTemperatureCelsius !== undefined) {
    return `최저 ${forecast.minTemperatureCelsius}°C`;
  }
  if (forecast.maxPrecipitationProbabilityPercent !== undefined) {
    return `강수확률 ${forecast.maxPrecipitationProbabilityPercent}%`;
  }
  if (forecast.maxTemperatureCelsius !== undefined) {
    return `최고 ${forecast.maxTemperatureCelsius}°C`;
  }
  return "예보 수치 확인 필요";
}

function formatFestivalRisk(
  riskLevel: AccessibleVisitAssessment["festivalRisk"]["riskLevel"],
): string {
  if (riskLevel === "LOW") return "비교적 여유로워요";
  if (riskLevel === "MEDIUM") return "조금 붐빌 수 있어요";
  if (riskLevel === "HIGH") return "혼잡 가능성 높아요";
  return "혼잡 확인 필요";
}

function formatChargerCount(
  status: AccessibleVisitAssessment["chargers"]["status"],
  count: number,
): string {
  if (status === "FAILED" || status === "NO_DATA" || count === 0) return "정보 확인 필요";
  return `주변 충전소 ${count}곳`;
}

function formatFestivalCount(count: number): string {
  return count > 0 ? `방문일에 주변 행사 ${count}개가 열려요` : "확인된 주변 행사가 없어요";
}

function formatFestivalItem(festival: NearbyFestival): string {
  const distance =
    festival.distanceKm !== undefined ? ` · ${formatDistance(festival.distanceKm)}` : "";
  return `• ${festival.name}${distance}`;
}

function selectVisitForecast(
  forecasts: DailyWeatherForecast[],
  visitDate: string,
): DailyWeatherForecast | undefined {
  return forecasts.find((forecast) => forecast.forecastDate === visitDate) ?? forecasts[0];
}

function selectNearestCharger(chargers: ChargerSummary[]): ChargerSummary | undefined {
  return chargers.toSorted((left, right) => left.distanceKm - right.distanceKm)[0];
}

function sortFestivalsByDistance(festivals: NearbyFestival[]): NearbyFestival[] {
  return festivals.toSorted(
    (left, right) =>
      (left.distanceKm ?? Number.POSITIVE_INFINITY) -
      (right.distanceKm ?? Number.POSITIVE_INFINITY),
  );
}

function getWeatherIcon(riskType: WeatherRiskType | undefined): string {
  if (riskType === "HEAT") return "☀️";
  if (riskType === "COLD") return "🥶";
  if (riskType === "SNOW") return "❄️";
  if (riskType === "ICY_ROAD") return "🧊";
  if (riskType === "RAIN" || riskType === "HEAVY_RAIN") return "🌧";
  return "🌤";
}

function getDefaultOverallReason(status: VisitAssessmentStatus): string {
  if (status === "LIKELY_ACCESSIBLE") return "현재 확인된 정보에서는 큰 위험 신호가 많지 않아요";
  if (status === "ACCESSIBLE_WITH_CAUTION") return "확인해야 할 유의사항이 있어요";
  if (status === "CHECK_REQUIRED") return "일부 정보를 방문 전에 다시 확인하는 게 좋아요";
  return "확인된 정보가 부족해 방문 전에 한 번 더 확인하는 게 좋아요";
}

function summaryRow(left: ColWidgetNode, right: ColWidgetNode): WidgetNode {
  return {
    type: "Row",
    gap: 8,
    align: "stretch",
    children: [left, right],
  };
}

function summaryBox(heading: string, lines: string[]): ColWidgetNode {
  return {
    type: "Col",
    gap: 4,
    padding: 10,
    flex: 1,
    align: "stretch",
    radius: "md",
    background: "#F5F7FA",
    children: [text(heading, "sm", "semibold"), ...lines.map((line) => text(line, "sm"))],
  };
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
  size: "sm" | "md" | "lg",
  weight: TextWidgetNode["weight"] = "normal",
): TextWidgetNode {
  return { type: "Text", value, size, weight };
}

function caption(value: string): WidgetNode {
  return { type: "Caption", value, size: "md", color: "#667085" };
}

function divider(): WidgetNode {
  return { type: "Divider", spacing: 8, color: "#E4E7EC" };
}

function formatVisitDate(visitDate: string): string {
  const [, month = visitDate, day = ""] = visitDate.split("-");
  return `${Number(month)}월 ${Number(day)}일`;
}

function formatDistance(distanceKm: number): string {
  return `${Math.round(distanceKm * 10) / 10}km`;
}

function uniqueFacilities(keys: FacilityKey[]): FacilityKey[] {
  return [...new Set(keys)];
}

function isWheelchairTraveler(travelerType: TravelerType): boolean {
  return travelerType === "POWER_WHEELCHAIR" || travelerType === "MANUAL_WHEELCHAIR";
}

function joinKorean(values: string[]): string {
  return values.length <= 1 ? (values[0] ?? "") : `${values[0]}와 ${values[1]}`;
}

function trimSentenceEnding(value: string): string {
  return value.trim().replaceAll(/[.!?。]+$/g, "");
}

function formatReportedDescription(value: string): string {
  const description = trimSentenceEnding(value);
  const endings: ReadonlyArray<readonly [RegExp, string]> = [
    [/가능함$/, "가능하다고"],
    [/있음$/, "있다고"],
    [/없음$/, "없다고"],
    [/가능$/, "가능하다고"],
    [/됨$/, "된다고"],
  ];

  for (const [pattern, replacement] of endings) {
    if (pattern.test(description)) {
      return `${description.replace(pattern, replacement)} 안내돼요`;
    }
  }

  return `${description} 내용으로 안내돼요`;
}

function stripLeadingEmoji(value: string): string {
  return value.replace(/^[^가-힣A-Za-z0-9]+\s*/, "");
}
