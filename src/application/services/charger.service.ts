import {
  WheelchairChargerRepositoryError,
  type WheelchairChargerRepository,
} from "../ports/wheelchair-charger.repository.js";
import type {
  ChargerDataFreshness,
  ChargerSourceData,
  ChargerSummary,
  NearbyWheelchairChargerResult,
} from "../../domain/charger.js";
import type { Coordinates, Destination } from "../../domain/destination.js";
import { calculateDistanceKm } from "../../domain/geo.js";
import type { OperationContext } from "../ports/operation-context.js";

export interface ChargerServiceRequest {
  destination: Destination;
  radiusKm?: number;
  context?: OperationContext;
}

type RegionParseResult =
  | {
      status: "SUCCESS";
      province: string;
      cityCounty: string;
    }
  | {
      status: "EMPTY";
    }
  | {
      status: "FAILED";
    };

const defaultRadiusKm = 3;
const staleDataThresholdDays = 180;
const maxReturnedChargers = 3;

export class ChargerService {
  constructor(private readonly repository: WheelchairChargerRepository) {}

  async findNearbyChargers(
    request: ChargerServiceRequest,
  ): Promise<NearbyWheelchairChargerResult> {
    const radiusKm = request.radiusKm ?? defaultRadiusKm;
    const region = parseRegion(request.destination.address);

    if (region.status === "EMPTY") {
      return createNoDataResult(
        request,
        radiusKm,
        "목적지 주소가 없어 시도명과 시군구명을 확인할 수 없습니다.",
      );
    }

    if (region.status === "FAILED") {
      return createFailedResult(
        request,
        radiusKm,
        "목적지 주소에서 시도명과 시군구명을 추출하지 못했습니다.",
      );
    }

    try {
      const chargers = await this.repository.findByRegion(
        {
          province: region.province,
          cityCounty: region.cityCounty,
        },
        request.context,
      );
      return createResultFromChargers(request, radiusKm, chargers);
    } catch (error) {
      return createFailedResult(request, radiusKm, getLookupFailureCaution(error));
    }
  }
}

function getLookupFailureCaution(error: unknown): string {
  if (error instanceof WheelchairChargerRepositoryError && error.userMessage !== undefined) {
    return error.userMessage;
  }

  return "전동휠체어 충전소 정보를 조회하지 못했습니다.";
}

function createResultFromChargers(
  request: ChargerServiceRequest,
  radiusKm: number,
  chargers: ChargerSourceData[],
): NearbyWheelchairChargerResult {
  const nearbyChargers = chargers
    .map((charger) => toChargerCandidate(charger, request.destination.coordinates))
    .filter((candidate): candidate is ChargerCandidate => candidate !== undefined)
    .filter((candidate) => candidate.distanceKm <= radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, maxReturnedChargers)
    .map((candidate) => candidate.summary);

  if (nearbyChargers.length === 0) {
    return createNoDataResult(
      request,
      radiusKm,
      `반경 ${radiusKm}km 이내에 좌표가 확인된 전동휠체어 충전소 데이터가 없습니다.`,
    );
  }

  return {
    status: "SUCCESS",
    destination: request.destination,
    radiusKm,
    chargers: nearbyChargers,
    cautions: createCautions(nearbyChargers),
  };
}

function createCautions(chargers: ChargerSummary[]): string[] {
  const staleChargerNames = chargers
    .filter((charger) => charger.dataFreshness === "STALE")
    .map((charger) => charger.name);

  const staleCaution =
    staleChargerNames.length > 0
      ? [
          `데이터 기준일이 ${staleDataThresholdDays}일 이상 지난 충전소가 있습니다: ${staleChargerNames.join(", ")}. 방문 전 운영 여부를 다시 확인하세요.`,
        ]
      : [];

  return ["충전소 실시간 작동 여부는 확인할 수 없습니다.", ...staleCaution];
}

interface ChargerCandidate {
  distanceKm: number;
  summary: ChargerSummary;
}

function toChargerCandidate(
  charger: ChargerSourceData,
  destinationCoordinates: Coordinates,
): ChargerCandidate | undefined {
  if (charger.latitude === undefined || charger.longitude === undefined) {
    return undefined;
  }

  const distanceKm = calculateDistanceKm(destinationCoordinates, {
    latitude: charger.latitude,
    longitude: charger.longitude,
  });

  return {
    distanceKm,
    summary: {
      name: charger.name,
      ...(charger.address !== undefined ? { address: charger.address } : {}),
      ...(charger.installationLocationDescription !== undefined
        ? { installationLocationDescription: charger.installationLocationDescription }
        : {}),
      distanceKm: roundDistance(distanceKm),
      ...(charger.managingOrganization !== undefined
        ? { managingOrganization: charger.managingOrganization }
        : {}),
      ...(charger.phoneNumber !== undefined ? { phoneNumber: charger.phoneNumber } : {}),
      ...(charger.referenceDate !== undefined ? { referenceDate: charger.referenceDate } : {}),
      ...(charger.operatingHours !== undefined
        ? { operatingHours: charger.operatingHours }
        : {}),
      dataFreshness: calculateDataFreshness(charger.referenceDate),
      realtimeAvailability: "UNKNOWN",
    },
  };
}

function calculateDataFreshness(referenceDate: string | undefined): ChargerDataFreshness {
  const parsedDate = parseReferenceDate(referenceDate);

  if (parsedDate === undefined) {
    return "UNKNOWN";
  }

  const ageInDays = (Date.now() - parsedDate.getTime()) / (1000 * 60 * 60 * 24);

  if (!Number.isFinite(ageInDays) || ageInDays < 0) {
    return "UNKNOWN";
  }

  return ageInDays > staleDataThresholdDays ? "STALE" : "FRESH";
}

function parseReferenceDate(referenceDate: string | undefined): Date | undefined {
  if (referenceDate === undefined) {
    return undefined;
  }

  const normalized = referenceDate.trim();
  const isoLikeMatch = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(normalized);

  if (isoLikeMatch === null) {
    return undefined;
  }

  const [, year, month, day] = isoLikeMatch;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);

  const validationDate = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));
  const isCalendarValid =
    validationDate.getUTCFullYear() === yearNumber &&
    validationDate.getUTCMonth() === monthNumber - 1 &&
    validationDate.getUTCDate() === dayNumber;

  if (!isCalendarValid) {
    return undefined;
  }

  const parsedDate = new Date(`${year}-${month}-${day}T00:00:00+09:00`);

  return Number.isNaN(parsedDate.getTime()) ? undefined : parsedDate;
}

function parseRegion(address: string | undefined): RegionParseResult {
  if (address === undefined) {
    return { status: "EMPTY" };
  }

  const normalizedAddress = address.trim();

  if (normalizedAddress.length === 0) {
    return { status: "EMPTY" };
  }

  const [province, cityCounty] = normalizedAddress.split(/\s+/);

  if (province === undefined || province.length === 0) {
    return { status: "EMPTY" };
  }

  if (cityCounty === undefined || cityCounty.length === 0) {
    return { status: "FAILED" };
  }

  return {
    status: "SUCCESS",
    province,
    cityCounty,
  };
}

function createNoDataResult(
  request: ChargerServiceRequest,
  radiusKm: number,
  caution: string,
): NearbyWheelchairChargerResult {
  return {
    status: "NO_DATA",
    destination: request.destination,
    radiusKm,
    chargers: [],
    cautions: [caution],
  };
}

function createFailedResult(
  request: ChargerServiceRequest,
  radiusKm: number,
  caution: string,
): NearbyWheelchairChargerResult {
  return {
    status: "FAILED",
    destination: request.destination,
    radiusKm,
    chargers: [],
    cautions: [caution],
  };
}

function roundDistance(distanceKm: number): number {
  return Math.round(distanceKm * 100) / 100;
}
