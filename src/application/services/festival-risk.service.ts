import type { FestivalRepository } from "../ports/festival.repository.js";
import type { Destination } from "../../domain/destination.js";
import type {
  DestinationFestivalRiskResult,
  FestivalRiskLevel,
  FestivalSourceData,
  NearbyFestival,
} from "../../domain/festival.js";
import { calculateDistanceKm } from "../../domain/geo.js";
import { toLoggableError } from "./logging.js";
import type { OperationContext } from "../ports/operation-context.js";

const defaultRadiusKm = 3;
const highRiskDistanceKm = 1;
const highRiskFestivalCount = 2;
const maxReturnedFestivals = 5;

export interface FestivalRiskAssessmentRequest {
  destination: Destination;
  visitDate: string;
  radiusKm?: number;
  context?: OperationContext;
}

export class FestivalRiskService {
  constructor(private readonly repository: FestivalRepository) {}

  async assess(request: FestivalRiskAssessmentRequest): Promise<DestinationFestivalRiskResult> {
    const radiusKm = request.radiusKm ?? defaultRadiusKm;

    try {
      const festivals = await this.repository.findNearby(
        {
          destinationName: request.destination.name,
          ...(request.destination.address !== undefined
            ? { address: request.destination.address }
            : {}),
          coordinates: request.destination.coordinates,
          visitDate: request.visitDate,
          radiusKm,
        },
        request.context,
      );

      return createResult(request.destination, request.visitDate, radiusKm, festivals);
    } catch (error) {
      logFestivalRiskAssessmentFailure(request, radiusKm, error);

      return {
        status: "FAILED",
        destination: request.destination,
        visitDate: request.visitDate,
        radiusKm,
        riskLevel: "UNKNOWN",
        festivals: [],
        cautions: ["축제 정보를 조회하지 못했습니다. 방문 전 현장 공지와 교통 상황을 확인하세요."],
      };
    }
  }
}

function logFestivalRiskAssessmentFailure(
  request: FestivalRiskAssessmentRequest,
  radiusKm: number,
  error: unknown,
): void {
  console.error("[FestivalRiskService] failed to assess festival risk", {
    destination: request.destination,
    visitDate: request.visitDate,
    radiusKm,
    error: toLoggableError(error),
  });
}

function createResult(
  destination: Destination,
  visitDate: string,
  radiusKm: number,
  festivals: FestivalSourceData[],
): DestinationFestivalRiskResult {
  const allNearbyFestivals = festivals.map((festival) => toNearbyFestival(destination, festival));
  const nearbyFestivals = allNearbyFestivals.slice(0, maxReturnedFestivals);
  const riskLevel = calculateRiskLevel(allNearbyFestivals);

  return {
    status: "SUCCESS",
    destination,
    visitDate,
    radiusKm,
    riskLevel,
    festivals: nearbyFestivals,
    cautions: createCautions(riskLevel, nearbyFestivals, allNearbyFestivals.length),
  };
}

function toNearbyFestival(destination: Destination, festival: FestivalSourceData): NearbyFestival {
  const distanceKm =
    festival.latitude !== undefined && festival.longitude !== undefined
      ? roundDistance(
          calculateDistanceKm(destination.coordinates, {
            latitude: festival.latitude,
            longitude: festival.longitude,
          }),
        )
      : undefined;

  return {
    id: festival.id,
    name: festival.name,
    ...(festival.venue !== undefined ? { venue: festival.venue } : {}),
    ...(festival.address !== undefined ? { address: festival.address } : {}),
    ...(festival.startDate !== undefined ? { startDate: festival.startDate } : {}),
    ...(festival.endDate !== undefined ? { endDate: festival.endDate } : {}),
    ...(distanceKm !== undefined ? { distanceKm } : {}),
    ...(festival.phoneNumber !== undefined ? { phoneNumber: festival.phoneNumber } : {}),
    ...(festival.referenceDate !== undefined ? { referenceDate: festival.referenceDate } : {}),
  };
}

function calculateRiskLevel(festivals: NearbyFestival[]): FestivalRiskLevel {
  if (festivals.length === 0) {
    return "LOW";
  }

  const distances = festivals
    .map((festival) => festival.distanceKm)
    .filter((distance): distance is number => distance !== undefined);

  if (distances.length === 0) {
    return "UNKNOWN";
  }

  if (
    distances.some((distance) => distance <= highRiskDistanceKm) ||
    festivals.length >= highRiskFestivalCount
  ) {
    return "HIGH";
  }

  return "MEDIUM";
}

function createCautions(
  riskLevel: FestivalRiskLevel,
  festivals: NearbyFestival[],
  totalFestivalCount: number,
): string[] {
  const truncationCaution =
    totalFestivalCount > festivals.length
      ? [`주변 축제는 최대 ${maxReturnedFestivals}개까지만 반환합니다.`]
      : [];

  if (riskLevel === "LOW") {
    return [
      "방문일 기준 반경 내 진행 축제는 확인되지 않았습니다.",
      "좌표가 없는 축제 데이터는 거리 계산에서 제외될 수 있습니다.",
      ...truncationCaution,
    ];
  }

  if (riskLevel === "UNKNOWN") {
    return [
      "축제 위치 정보가 부족해 거리 기반 위험도를 확정하기 어렵습니다.",
      "좌표가 없는 축제 데이터는 거리 계산에서 제외될 수 있습니다.",
      ...truncationCaution,
    ];
  }

  const festivalNames = [...new Set(festivals.map((festival) => festival.name))].join(", ");

  if (riskLevel === "HIGH") {
    return [
      `방문지와 가까운 축제가 진행 중입니다: ${festivalNames}. 교통과 주차 혼잡을 확인하세요.`,
      ...truncationCaution,
    ];
  }

  return [
    `방문지 주변에서 축제가 진행 중입니다: ${festivalNames}. 이동 동선을 미리 확인하세요.`,
    ...truncationCaution,
  ];
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 100) / 100;
}
