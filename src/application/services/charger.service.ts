import {
  WheelchairChargerRepositoryError,
  type WheelchairChargerRepository,
} from "../ports/wheelchair-charger.repository.js";
import type {
  ChargerSourceData,
  ChargerSummary,
  NearbyWheelchairChargerResult,
} from "../../domain/charger.js";
import type { Coordinates, Destination } from "../../domain/destination.js";
import type { OperationContext } from "../ports/operation-context.js";

export interface ChargerServiceRequest {
  destination: Destination;
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

const earthRadiusKm = 6371;

export class ChargerService {
  constructor(private readonly repository: WheelchairChargerRepository) {}

  async findNearbyChargers(request: ChargerServiceRequest): Promise<NearbyWheelchairChargerResult> {
    const region = parseRegion(request.destination.address);

    if (region.status === "EMPTY") {
      return createNoDataResult(
        request,
        "목적지 주소가 없어 시도명과 시군구명을 확인할 수 없습니다.",
      );
    }

    if (region.status === "FAILED") {
      return createFailedResult(
        request,
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
      return createResultFromChargers(request, chargers);
    } catch (error) {
      return createFailedResult(request, getLookupFailureCaution(error));
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
  chargers: ChargerSourceData[],
): NearbyWheelchairChargerResult {
  const nearbyChargers = chargers
    .map((charger) => toChargerSummary(charger, request.destination.coordinates))
    .filter((charger): charger is ChargerSummary => charger !== undefined)
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .slice(0, 3);

  if (nearbyChargers.length === 0) {
    return createNoDataResult(
      request,
      "요청한 지역에서 좌표가 확인된 전동휠체어 충전소 데이터가 없습니다.",
    );
  }

  return {
    status: "SUCCESS",
    destination: request.destination,
    chargers: nearbyChargers,
    cautions: ["충전소 실시간 작동 여부는 확인할 수 없습니다."],
  };
}

function toChargerSummary(
  charger: ChargerSourceData,
  destinationCoordinates: Coordinates,
): ChargerSummary | undefined {
  if (charger.latitude === undefined || charger.longitude === undefined) {
    return undefined;
  }

  const distanceKm = calculateDistanceKm(destinationCoordinates, {
    latitude: charger.latitude,
    longitude: charger.longitude,
  });

  return {
    name: charger.name,
    ...(charger.address !== undefined ? { address: charger.address } : {}),
    ...(charger.installationLocationDescription !== undefined
      ? { installationLocationDescription: charger.installationLocationDescription }
      : {}),
    distanceKm,
    ...(charger.managingOrganization !== undefined
      ? { managingOrganization: charger.managingOrganization }
      : {}),
    ...(charger.phoneNumber !== undefined ? { phoneNumber: charger.phoneNumber } : {}),
    ...(charger.referenceDate !== undefined ? { referenceDate: charger.referenceDate } : {}),
    realtimeAvailability: "UNKNOWN",
  };
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
  caution: string,
): NearbyWheelchairChargerResult {
  return {
    status: "NO_DATA",
    destination: request.destination,
    chargers: [],
    cautions: [caution],
  };
}

function createFailedResult(
  request: ChargerServiceRequest,
  caution: string,
): NearbyWheelchairChargerResult {
  return {
    status: "FAILED",
    destination: request.destination,
    chargers: [],
    cautions: [caution],
  };
}

function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  const distance = 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  return Math.round(distance * 100) / 100;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
