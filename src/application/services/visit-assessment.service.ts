import type { AccessibilityService } from "./accessibility.service.js";
import type { ChargerService } from "./charger.service.js";
import type { DestinationResolver } from "./destination-resolver.js";
import type { FestivalRiskService } from "./festival-risk.service.js";
import type { WeatherService } from "./weather.service.js";
import type {
  AccessibilityFacilities,
  DestinationAccessibilityResult,
  TravelerType,
} from "../../domain/accessibility.js";
import type { NearbyWheelchairChargerResult } from "../../domain/charger.js";
import type {
  Destination,
  DestinationCandidate,
  DestinationResolutionStatus,
} from "../../domain/destination.js";
import type { DestinationFestivalRiskResult } from "../../domain/festival.js";
import type {
  AccessibleVisitAssessment,
  CautionItem,
  ChecklistItem,
  VisitAssessmentStatus,
} from "../../domain/visit-assessment.js";
import type { DestinationWeatherResult } from "../../domain/weather.js";

export interface VisitAssessmentRequest {
  destination: string;
  contentId?: string;
  visitDate: string;
  travelerType: TravelerType;
  radiusKm?: number;
}

const defaultRadiusKm = 3;
const maxCautionsPerDomain = 5;

type VisitAssessmentSourceResult =
  | DestinationAccessibilityResult
  | DestinationWeatherResult
  | NearbyWheelchairChargerResult
  | DestinationFestivalRiskResult;
type VisitAssessmentSourceStatus = VisitAssessmentSourceResult["status"];

export class VisitAssessmentDestinationResolutionError extends Error {
  constructor(
    readonly status: DestinationResolutionStatus,
    readonly candidates: DestinationCandidate[] = [],
  ) {
    super("Destination could not be resolved for accessible visit assessment.");
    this.name = "VisitAssessmentDestinationResolutionError";
  }
}

export class VisitAssessmentService {
  constructor(
    private readonly destinationResolver: DestinationResolver,
    private readonly accessibilityService: AccessibilityService,
    private readonly weatherService: WeatherService,
    private readonly chargerService: ChargerService,
    private readonly festivalRiskService: FestivalRiskService,
  ) {}

  async assess(request: VisitAssessmentRequest): Promise<AccessibleVisitAssessment> {
    const radiusKm = request.radiusKm ?? defaultRadiusKm;
    const resolution =
      request.contentId !== undefined
        ? await this.destinationResolver.resolveByContentId({
            contentId: request.contentId,
            destinationName: request.destination,
          })
        : await this.destinationResolver.resolve(request.destination);

    if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
      throw new VisitAssessmentDestinationResolutionError(
        resolution.status,
        resolution.candidates ?? [],
      );
    }

    const destination = resolution.destination;
    const [accessibility, weather, chargers, festivalRisk] = await Promise.allSettled([
      this.accessibilityService.getAccessibility({
        destination,
        travelerType: request.travelerType,
      }),
      this.weatherService.getDestinationWeather({
        destination,
        visitDate: request.visitDate,
        travelerType: request.travelerType,
      }),
      this.chargerService.findNearbyChargers({ destination, radiusKm }),
      this.festivalRiskService.assess({
        destination,
        visitDate: request.visitDate,
        radiusKm,
      }),
    ]);

    const accessibilityResult =
      accessibility.status === "fulfilled"
        ? accessibility.value
        : createFailedAccessibilityResult(destination, request.travelerType);
    const weatherResult =
      weather.status === "fulfilled"
        ? weather.value
        : createFailedWeatherResult(destination, request.visitDate, request.travelerType);
    const chargerResult =
      chargers.status === "fulfilled"
        ? chargers.value
        : createFailedChargerResult(destination, radiusKm);
    const festivalRiskResult =
      festivalRisk.status === "fulfilled"
        ? festivalRisk.value
        : createFailedFestivalRiskResult(destination, request.visitDate, radiusKm);
    const combinedCautions = createCombinedCautions(
      accessibilityResult,
      weatherResult,
      chargerResult,
      festivalRiskResult,
    );
    const overallStatus = calculateOverallStatus({
      accessibilityStatus: accessibilityResult.status,
      weatherStatus: weatherResult.status,
      chargerStatus: chargerResult.status,
      festivalStatus: festivalRiskResult.status,
      cautionCount: combinedCautions.length,
    });

    return {
      destination,
      visit: {
        date: request.visitDate,
        travelerType: request.travelerType,
        radiusKm,
      },
      overallAssessment: {
        status: overallStatus,
        reasons: createOverallReasons(overallStatus),
      },
      accessibility: accessibilityResult,
      weather: weatherResult,
      chargers: chargerResult,
      festivalRisk: festivalRiskResult,
      combinedCautions,
      unknowns: createUnknowns(
        accessibilityResult,
        weatherResult,
        chargerResult,
        festivalRiskResult,
      ),
      checklist: createChecklist(request.travelerType),
      phoneCheckQuestions: createPhoneCheckQuestions(request.travelerType),
    };
  }
}

function createFailedAccessibilityResult(
  destination: Destination,
  travelerType: TravelerType,
): DestinationAccessibilityResult {
  const facilities = createNotProvidedFacilities();

  return {
    status: "FAILED",
    destination,
    travelerType,
    facilities,
    cautions: ["무장애 편의시설 정보를 조회하지 못했습니다. 방문 전 현장에 확인하세요."],
    unknowns: Object.keys(facilities),
  };
}

function createFailedWeatherResult(
  destination: Destination,
  visitDate: string,
  travelerType: TravelerType,
): DestinationWeatherResult {
  return {
    status: "FAILED",
    destination,
    visitDate,
    travelerType,
    forecasts: [],
    risk: {
      riskLevel: "CAUTION",
      riskTypes: [],
      cautions: ["날씨 정보를 조회하지 못했습니다. 방문 전 공식 예보를 확인하세요."],
    },
  };
}

function createFailedChargerResult(
  destination: Destination,
  radiusKm: number,
): NearbyWheelchairChargerResult {
  return {
    status: "FAILED",
    destination,
    radiusKm,
    chargers: [],
    cautions: ["전동휠체어 충전소 정보를 조회하지 못했습니다."],
  };
}

function createFailedFestivalRiskResult(
  destination: Destination,
  visitDate: string,
  radiusKm: number,
): DestinationFestivalRiskResult {
  return {
    status: "FAILED",
    destination,
    visitDate,
    radiusKm,
    riskLevel: "UNKNOWN",
    festivals: [],
    cautions: ["축제 정보를 조회하지 못했습니다. 방문 전 현장 공지와 교통 상황을 확인하세요."],
  };
}

function createNotProvidedFacilities(): AccessibilityFacilities {
  return {
    parking: { status: "NOT_PROVIDED" },
    route: { status: "NOT_PROVIDED" },
    entrance: { status: "NOT_PROVIDED" },
    elevator: { status: "NOT_PROVIDED" },
    restroom: { status: "NOT_PROVIDED" },
    wheelchairRental: { status: "NOT_PROVIDED" },
    stroller: { status: "NOT_PROVIDED" },
    lactationRoom: { status: "NOT_PROVIDED" },
  };
}

function createCombinedCautions(
  accessibility: DestinationAccessibilityResult,
  weather: DestinationWeatherResult,
  chargers: NearbyWheelchairChargerResult,
  festivalRisk: DestinationFestivalRiskResult,
): CautionItem[] {
  return [
    ...toCautionItems("ACCESSIBILITY", accessibility.cautions, accessibility.status),
    ...toCautionItems("WEATHER", weather.risk.cautions, weather.status),
    ...toCautionItems("CHARGER", chargers.cautions, chargers.status),
    ...toCautionItems("FESTIVAL", festivalRisk.cautions, festivalRisk.status),
  ];
}

function toCautionItems(
  domain: CautionItem["domains"][number],
  messages: string[],
  status: VisitAssessmentSourceStatus,
): CautionItem[] {
  return messages.slice(0, maxCautionsPerDomain).map((message, index) => ({
    code: `${domain}_${index + 1}`,
    level: getCautionLevel(domain, status),
    domains: [domain],
    message,
    evidence: [message],
  }));
}

function getCautionLevel(
  domain: CautionItem["domains"][number],
  status: VisitAssessmentSourceStatus,
): CautionItem["level"] {
  if (status === "FAILED") {
    return "HIGH";
  }

  if (status === "NO_DATA" || status === "OUT_OF_RANGE" || status === "NOT_APPLICABLE") {
    return "MEDIUM";
  }

  return domain === "WEATHER" || domain === "FESTIVAL" ? "MEDIUM" : "LOW";
}

function createUnknowns(
  accessibility: DestinationAccessibilityResult,
  weather: DestinationWeatherResult,
  chargers: NearbyWheelchairChargerResult,
  festivalRisk: DestinationFestivalRiskResult,
): string[] {
  return [
    ...accessibility.unknowns,
    ...(weather.status === "FAILED" || weather.status === "NO_DATA" || weather.status === "OUT_OF_RANGE"
      ? ["날씨 정보"]
      : []),
    ...(chargers.status === "FAILED" || chargers.status === "NO_DATA" ? ["전동휠체어 충전소 정보"] : []),
    ...(festivalRisk.status === "FAILED" || festivalRisk.status === "NO_DATA"
      ? ["축제 기반 혼잡 위험 정보"]
      : []),
  ];
}

function calculateOverallStatus(input: {
  accessibilityStatus: "SUCCESS" | "NO_DATA" | "FAILED";
  weatherStatus: "AVAILABLE" | "OUT_OF_RANGE" | "NO_DATA" | "FAILED";
  chargerStatus: "SUCCESS" | "NO_DATA" | "FAILED" | "NOT_APPLICABLE";
  festivalStatus: "SUCCESS" | "NO_DATA" | "FAILED";
  cautionCount: number;
}): VisitAssessmentStatus {
  if (
    input.accessibilityStatus === "FAILED" ||
    input.weatherStatus === "FAILED" ||
    input.chargerStatus === "FAILED" ||
    input.festivalStatus === "FAILED"
  ) {
    return "CHECK_REQUIRED";
  }

  if (input.accessibilityStatus === "NO_DATA" || input.weatherStatus === "NO_DATA") {
    return "INSUFFICIENT_DATA";
  }

  return input.cautionCount > 0 ? "ACCESSIBLE_WITH_CAUTION" : "LIKELY_ACCESSIBLE";
}

function createOverallReasons(status: VisitAssessmentStatus): string[] {
  if (status === "LIKELY_ACCESSIBLE") {
    return ["조회된 공공데이터 기준 주요 위험 신호가 크지 않습니다."];
  }

  if (status === "ACCESSIBLE_WITH_CAUTION") {
    return ["방문은 가능해 보이나 확인해야 할 유의사항이 있습니다."];
  }

  if (status === "CHECK_REQUIRED") {
    return ["일부 정보를 조회하지 못해 방문 전 현장 확인이 필요합니다."];
  }

  return ["방문 가능 여부를 판단하기에 필요한 데이터가 부족합니다."];
}

function createChecklist(travelerType: TravelerType): ChecklistItem[] {
  return [
    {
      code: "CALL_DESTINATION",
      label: "방문지에 핵심 편의시설 운영 여부 확인",
      required: true,
    },
    {
      code: "CHECK_WEATHER",
      label: "방문 당일 공식 예보 재확인",
      required: true,
    },
    {
      code: "CHECK_ROUTE",
      label: "주차장, 출입구, 엘리베이터 동선 확인",
      required: travelerType !== "STROLLER",
    },
    {
      code: "CHECK_CHARGER",
      label: "전동휠체어 충전소 운영 여부 확인",
      required: travelerType === "POWER_WHEELCHAIR",
    },
  ];
}

function createPhoneCheckQuestions(travelerType: TravelerType): string[] {
  const questions = [
    "장애인 주차장, 접근로, 장애인 화장실을 현재 이용할 수 있나요?",
    "방문 예정일에 공사, 행사, 통제 구간이 있나요?",
  ];

  if (travelerType === "POWER_WHEELCHAIR") {
    questions.push("전동휠체어 충전 또는 대기 가능한 장소가 있나요?");
  }

  if (travelerType === "STROLLER") {
    questions.push("유모차 이동 가능한 엘리베이터와 수유실을 이용할 수 있나요?");
  }

  return questions;
}
