import type { FestivalRepository } from "../ports/festival.repository.js";
import type { Destination } from "../../domain/destination.js";
import type {
  DestinationFestivalRiskResult,
  FestivalRiskLevel,
  FestivalSourceData,
  NearbyFestival,
} from "../../domain/festival.js";
import { calculateDistanceKm } from "../../domain/geo.js";

const defaultRadiusKm = 3;
const highRiskDistanceKm = 1;
const highRiskFestivalCount = 2;

export interface FestivalRiskAssessmentRequest {
  destination: Destination;
  visitDate: string;
  radiusKm?: number;
}

export class FestivalRiskService {
  constructor(private readonly repository: FestivalRepository) {}

  async assess(request: FestivalRiskAssessmentRequest): Promise<DestinationFestivalRiskResult> {
    const radiusKm = request.radiusKm ?? defaultRadiusKm;

    try {
      const festivals = await this.repository.findNearby({
        coordinates: request.destination.coordinates,
        visitDate: request.visitDate,
        radiusKm,
      });

      return createResult(request.destination, request.visitDate, radiusKm, festivals);
    } catch {
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

function createResult(
  destination: Destination,
  visitDate: string,
  radiusKm: number,
  festivals: FestivalSourceData[],
): DestinationFestivalRiskResult {
  const nearbyFestivals = festivals.map((festival) => toNearbyFestival(destination, festival));
  const riskLevel = calculateRiskLevel(nearbyFestivals);

  return {
    status: nearbyFestivals.length > 0 ? "SUCCESS" : "NO_DATA",
    destination,
    visitDate,
    radiusKm,
    riskLevel,
    festivals: nearbyFestivals,
    cautions: createCautions(riskLevel, nearbyFestivals),
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

function createCautions(riskLevel: FestivalRiskLevel, festivals: NearbyFestival[]): string[] {
  if (riskLevel === "LOW") {
    return ["방문일 기준 주변 진행 축제는 확인되지 않았습니다."];
  }

  if (riskLevel === "UNKNOWN") {
    return ["축제 위치 정보가 부족해 거리 기반 위험도를 확정하기 어렵습니다."];
  }

  const festivalNames = festivals.map((festival) => festival.name).join(", ");

  if (riskLevel === "HIGH") {
    return [`방문지와 가까운 축제가 진행 중입니다: ${festivalNames}. 교통과 주차 혼잡을 확인하세요.`];
  }

  return [`방문지 주변에서 축제가 진행 중입니다: ${festivalNames}. 이동 동선을 미리 확인하세요.`];
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 100) / 100;
}
