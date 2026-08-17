import type { EvidenceItem, EvidenceStatus, TravelerType } from "../../domain/accessibility.js";
import type { ChargerSummary } from "../../domain/charger.js";
import type { NearbyFestival } from "../../domain/festival.js";
import type { AccessibleVisitAssessment } from "../../domain/visit-assessment.js";
import type { DailyWeatherForecast } from "../../domain/weather.js";

const culturalFestivalScopeNote =
  "전국문화축제표준데이터에 등록되고 좌표로 거리를 계산할 수 있는 문화축제 기준입니다. 모든 지역 행사나 실시간 혼잡도를 뜻하지 않습니다.";
const chargerRealtimeAvailabilityNote =
  "충전소 위치 정보만 제공하며 실시간 작동 상태와 현재 사용 가능 여부는 제공하지 않습니다.";

const facilityStatusMeanings: Readonly<Record<EvidenceStatus, string>> = {
  CONFIRMED: "공공데이터에 관련 설명이 제공됨",
  NOT_AVAILABLE: "공공데이터에 이용 불가 또는 시설 없음으로 명시됨",
  NOT_PROVIDED: "공공데이터에 정보가 제공되지 않음; 시설이 없다는 뜻이 아님",
  CONFLICTING: "제공된 정보가 서로 상충함",
};

const travelerTypeMeanings: Readonly<Record<TravelerType, string>> = {
  POWER_WHEELCHAIR: "전동휠체어 이용자",
  MANUAL_WHEELCHAIR: "수동휠체어 이용자",
  STROLLER: "유모차 동반자",
  ELDERLY_COMPANION: "고령자 동반자",
};

const internalUnknownLabels: Readonly<Record<string, string>> = {
  parking: "장애인 주차장",
  route: "접근로",
  entrance: "출입구",
  elevator: "엘리베이터",
  restroom: "장애인 화장실",
  wheelchairRental: "휠체어 대여",
  stroller: "유모차 대여",
  lactationRoom: "수유실",
  "축제 기반 혼잡 위험 정보": "공공데이터 등록 문화축제 정보",
};

export interface AccessibleVisitDetailContext {
  readonly contextType: "ACCESSIBLE_VISIT_DETAIL";
  readonly responseGuidance: string[];
  readonly destination: {
    readonly name: string;
    readonly address?: string;
  };
  readonly visit: {
    readonly date: string;
    readonly travelerType: TravelerType;
    readonly travelerTypeMeaning: string;
    readonly radiusKm: number;
  };
  readonly overall: {
    readonly status: AccessibleVisitAssessment["overallAssessment"]["status"];
    readonly reasons: string[];
  };
  readonly accessibility: {
    readonly dataStatus: AccessibleVisitAssessment["accessibility"]["status"];
    readonly cautions: string[];
    readonly route: FacilityDetail;
    readonly entrance: FacilityDetail;
    readonly elevator: FacilityDetail;
    readonly disabledRestroom: FacilityDetail;
    readonly disabledParking: FacilityDetail;
    readonly wheelchairRental: FacilityDetail;
    readonly strollerRental: FacilityDetail;
    readonly lactationRoom: FacilityDetail;
  };
  readonly weather: WeatherDetail;
  readonly culturalFestivals: {
    readonly dataStatus: AccessibleVisitAssessment["festivalRisk"]["status"];
    readonly radiusKm: number;
    readonly scopeNote: string;
    readonly festivals: FestivalDetail[];
    readonly cautions: string[];
  };
  readonly wheelchairChargers: WheelchairChargerDetail;
  readonly thingsToCheck: string[];
  readonly cautions: string[];
  readonly unknowns: string[];
  readonly phoneCheckQuestions?: string[];
}

interface FacilityDetail {
  readonly status: EvidenceStatus;
  readonly statusMeaning: string;
  readonly description?: string;
}

interface WeatherDetail {
  readonly dataStatus: AccessibleVisitAssessment["weather"]["status"];
  readonly minTemperatureCelsius?: number;
  readonly maxTemperatureCelsius?: number;
  readonly maxPrecipitationProbabilityPercent?: number;
  readonly maxPrecipitationAmountMm?: number;
  readonly precipitationAmountDescription?: string;
  readonly precipitationTypes: DailyWeatherForecast["precipitationTypes"];
  readonly riskTypes: AccessibleVisitAssessment["weather"]["risk"]["riskTypes"];
  readonly cautions: string[];
}

interface FestivalDetail {
  readonly name: string;
  readonly venue?: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly distanceKm?: number;
  readonly address?: string;
}

type WheelchairChargerDetail =
  | {
      readonly applicable: false;
      readonly reason: string;
      readonly realtimeAvailabilityNote: string;
      readonly chargers: [];
    }
  | {
      readonly applicable: true;
      readonly dataStatus: AccessibleVisitAssessment["chargers"]["status"];
      readonly radiusKm: number;
      readonly realtimeAvailabilityNote: string;
      readonly chargers: ChargerDetail[];
    };

interface ChargerDetail {
  readonly name: string;
  readonly distanceKm: number;
  readonly address?: string;
  readonly installationLocationDescription?: string;
  readonly managingOrganization?: string;
  readonly phoneNumber?: string;
}

/**
 * 종합 평가를 다시 계산하지 않고 같은 Service 결과를 상세 자연어 답변용 context로 정리한다.
 * 완성된 답변 문장을 만들기보다 사실, 불확실성, 데이터 범위를 명시적으로 전달한다.
 */
export function buildAccessibleVisitDetailContext(
  assessment: AccessibleVisitAssessment,
): AccessibleVisitDetailContext {
  const forecast = selectVisitForecast(assessment.weather.forecasts, assessment.visit.date);
  const context: AccessibleVisitDetailContext = {
    contextType: "ACCESSIBLE_VISIT_DETAIL",
    responseGuidance: [
      "이 context를 바탕으로 대화 흐름에 맞는 상세 자연어 답변을 작성합니다.",
      "NOT_PROVIDED는 시설이 없다는 뜻이 아니므로 정보 미제공으로 설명합니다.",
      "문화축제 데이터는 모든 행사 또는 실시간 혼잡 정보가 아닙니다.",
      "충전소 정보로 실시간 작동 여부나 현재 사용 가능 여부를 단정하지 않습니다.",
      "날씨 SKY 정보는 수집하지 않으므로 SKY 상태를 추정하지 않습니다.",
      "내부 상태 이름은 사용자에게 그대로 노출하지 말고 statusMeaning과 실제 근거를 자연어로 설명합니다.",
    ],
    destination: {
      name: assessment.destination.name,
      ...(assessment.destination.address !== undefined
        ? { address: assessment.destination.address }
        : {}),
    },
    visit: {
      date: assessment.visit.date,
      travelerType: assessment.visit.travelerType,
      travelerTypeMeaning: travelerTypeMeanings[assessment.visit.travelerType],
      radiusKm: assessment.visit.radiusKm,
    },
    overall: {
      status: assessment.overallAssessment.status,
      reasons: assessment.overallAssessment.reasons,
    },
    accessibility: {
      dataStatus: assessment.accessibility.status,
      cautions: assessment.accessibility.cautions,
      route: toFacilityDetail(assessment.accessibility.facilities.route),
      entrance: toFacilityDetail(assessment.accessibility.facilities.entrance),
      elevator: toFacilityDetail(assessment.accessibility.facilities.elevator),
      disabledRestroom: toFacilityDetail(assessment.accessibility.facilities.restroom),
      disabledParking: toFacilityDetail(assessment.accessibility.facilities.parking),
      wheelchairRental: toFacilityDetail(assessment.accessibility.facilities.wheelchairRental),
      strollerRental: toFacilityDetail(assessment.accessibility.facilities.stroller),
      lactationRoom: toFacilityDetail(assessment.accessibility.facilities.lactationRoom),
    },
    weather: {
      dataStatus: assessment.weather.status,
      ...(forecast?.minTemperatureCelsius !== undefined
        ? { minTemperatureCelsius: forecast.minTemperatureCelsius }
        : {}),
      ...(forecast?.maxTemperatureCelsius !== undefined
        ? { maxTemperatureCelsius: forecast.maxTemperatureCelsius }
        : {}),
      ...(forecast?.maxPrecipitationProbabilityPercent !== undefined
        ? {
            maxPrecipitationProbabilityPercent: forecast.maxPrecipitationProbabilityPercent,
          }
        : {}),
      ...(forecast?.maxPrecipitationAmountMm !== undefined
        ? { maxPrecipitationAmountMm: forecast.maxPrecipitationAmountMm }
        : {}),
      ...(forecast?.precipitationAmountDescription !== undefined
        ? { precipitationAmountDescription: forecast.precipitationAmountDescription }
        : {}),
      precipitationTypes: forecast?.precipitationTypes ?? [],
      riskTypes: assessment.weather.risk.riskTypes,
      cautions: assessment.weather.risk.cautions,
    },
    culturalFestivals: {
      dataStatus: assessment.festivalRisk.status,
      radiusKm: assessment.festivalRisk.radiusKm,
      scopeNote: culturalFestivalScopeNote,
      festivals: assessment.festivalRisk.festivals.map(toFestivalDetail),
      cautions: assessment.festivalRisk.cautions,
    },
    wheelchairChargers: buildWheelchairChargerDetail(assessment),
    thingsToCheck: buildDetailThingsToCheck(assessment),
    cautions: uniqueStrings(assessment.combinedCautions.map((caution) => caution.message)),
    unknowns: uniqueStrings(
      assessment.unknowns.map((unknown) => internalUnknownLabels[unknown] ?? unknown),
    ),
    ...(assessment.phoneCheckQuestions.length > 0
      ? { phoneCheckQuestions: assessment.phoneCheckQuestions }
      : {}),
  };

  return context;
}

function toFacilityDetail(evidence: EvidenceItem): FacilityDetail {
  return {
    status: evidence.status,
    statusMeaning: facilityStatusMeanings[evidence.status],
    ...(evidence.description !== undefined ? { description: evidence.description } : {}),
  };
}

function selectVisitForecast(
  forecasts: DailyWeatherForecast[],
  visitDate: string,
): DailyWeatherForecast | undefined {
  return forecasts.find((forecast) => forecast.forecastDate === visitDate);
}

function toFestivalDetail(festival: NearbyFestival): FestivalDetail {
  return {
    name: festival.name,
    ...(festival.venue !== undefined ? { venue: festival.venue } : {}),
    ...(festival.startDate !== undefined ? { startDate: festival.startDate } : {}),
    ...(festival.endDate !== undefined ? { endDate: festival.endDate } : {}),
    ...(festival.distanceKm !== undefined ? { distanceKm: festival.distanceKm } : {}),
    ...(festival.address !== undefined ? { address: festival.address } : {}),
  };
}

function buildWheelchairChargerDetail(
  assessment: AccessibleVisitAssessment,
): WheelchairChargerDetail {
  if (assessment.visit.travelerType !== "POWER_WHEELCHAIR") {
    return {
      applicable: false,
      reason: "전동휠체어 이용 조건이 아니므로 충전소를 핵심 상세 정보로 제공하지 않습니다.",
      realtimeAvailabilityNote: chargerRealtimeAvailabilityNote,
      chargers: [],
    };
  }

  return {
    applicable: true,
    dataStatus: assessment.chargers.status,
    radiusKm: assessment.chargers.radiusKm,
    realtimeAvailabilityNote: chargerRealtimeAvailabilityNote,
    chargers: assessment.chargers.chargers.slice(0, 3).map(toChargerDetail),
  };
}

function toChargerDetail(charger: ChargerSummary): ChargerDetail {
  return {
    name: charger.name,
    distanceKm: charger.distanceKm,
    ...(charger.address !== undefined ? { address: charger.address } : {}),
    ...(charger.installationLocationDescription !== undefined
      ? { installationLocationDescription: charger.installationLocationDescription }
      : {}),
    ...(charger.managingOrganization !== undefined
      ? { managingOrganization: charger.managingOrganization }
      : {}),
    ...(charger.phoneNumber !== undefined ? { phoneNumber: charger.phoneNumber } : {}),
  };
}

function buildDetailThingsToCheck(assessment: AccessibleVisitAssessment): string[] {
  const items: string[] = [];
  const facilities = assessment.accessibility.facilities;
  const unknownMovementFacilities = [
    ["접근로", facilities.route],
    ["출입구", facilities.entrance],
    ["엘리베이터", facilities.elevator],
  ] as const;
  const unknownLabels = unknownMovementFacilities
    .filter(
      ([, facility]) => facility.status === "NOT_PROVIDED" || facility.status === "CONFLICTING",
    )
    .map(([label]) => label);
  if (unknownLabels.length > 0) {
    items.push(`${unknownLabels.join(" · ")} 이용 가능 여부 확인`);
  }

  if (assessment.weather.status !== "AVAILABLE" || assessment.weather.risk.riskTypes.length > 0) {
    items.push("방문 당일 공식 예보 재확인");
  }
  items.push(...assessment.weather.risk.cautions);

  if (assessment.festivalRisk.festivals.length > 0) {
    items.push("문화축제 시간과 주변 이동 동선 확인");
  }

  if (assessment.visit.travelerType === "POWER_WHEELCHAIR") {
    items.push(
      assessment.chargers.chargers.length > 0
        ? "이용할 충전소의 실제 작동 여부 확인"
        : "대체 충전 계획과 방문지 충전 가능 여부 확인",
    );
  }

  return uniqueStrings([
    ...items,
    ...assessment.checklist.filter((item) => item.required).map((item) => item.label),
  ]);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}
