import type { FestivalRepository } from "../../application/ports/festival.repository.js";
import type { FestivalQuery } from "../../application/ports/festival.repository.js";
import type { Coordinates } from "../../domain/destination.js";
import type { FestivalSourceData } from "../../domain/festival.js";
import { calculateDistanceKm } from "../../domain/geo.js";
import type { FestivalApiClient } from "./festival-api.client.js";
import { mapFestivalResponseToSourceData } from "./festival.mapper.js";

export class FestivalAdapter implements FestivalRepository {
  constructor(private readonly client: FestivalApiClient) {}

  async findNearby(query: FestivalQuery): Promise<FestivalSourceData[]> {
    const response = await this.client.getFestivals();
    const festivals = mapFestivalResponseToSourceData(response);

    return festivals
      .filter((festival) => isActiveOnVisitDate(festival, query.visitDate))
      .filter((festival) => isWithinRadius(festival, query.coordinates, query.radiusKm))
      .sort(
        (left, right) =>
          getDistanceKm(left, query.coordinates) - getDistanceKm(right, query.coordinates),
      );
  }
}

function isActiveOnVisitDate(festival: FestivalSourceData, visitDate: string): boolean {
  if (!isIsoDate(festival.startDate) || !isIsoDate(festival.endDate) || !isIsoDate(visitDate)) {
    return false;
  }

  return festival.startDate <= visitDate && visitDate <= festival.endDate;
}

function isWithinRadius(
  festival: FestivalSourceData,
  coordinates: Coordinates,
  radiusKm: number,
): boolean {
  if (festival.latitude === undefined || festival.longitude === undefined) {
    return false;
  }

  return getDistanceKm(festival, coordinates) <= radiusKm;
}

function getDistanceKm(festival: FestivalSourceData, coordinates: Coordinates): number {
  if (festival.latitude === undefined || festival.longitude === undefined) {
    return Number.POSITIVE_INFINITY;
  }

  return calculateDistanceKm(coordinates, {
    latitude: festival.latitude,
    longitude: festival.longitude,
  });
}

function isIsoDate(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
