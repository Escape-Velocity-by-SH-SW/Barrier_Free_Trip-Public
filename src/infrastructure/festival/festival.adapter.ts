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
    const fastPathFestivals = await this.findNearbyFromFocusedQueries(query);

    if (fastPathFestivals.length > 0) {
      return fastPathFestivals;
    }

    const festivals = await this.getMappedFestivals();
    return filterNearbyFestivals(festivals, query, "broad");
  }

  private async findNearbyFromFocusedQueries(query: FestivalQuery): Promise<FestivalSourceData[]> {
    const requests = createFocusedFestivalRequests(query);

    if (requests.length === 0) {
      return [];
    }

    const responses = await Promise.all(
      requests.map((request) =>
        this.client.getFestivals({
          ...request,
          perPage: this.client.focusedPerPage,
        }),
      ),
    );
    const festivals = responses.flatMap(mapFestivalResponseToSourceData);

    return filterNearbyFestivals(festivals, query, "focused");
  }

  private async getMappedFestivals(): Promise<FestivalSourceData[]> {
    const response = await this.client.getAllFestivals();
    return mapFestivalResponseToSourceData(response);
  }
}

function filterNearbyFestivals(
  festivals: FestivalSourceData[],
  query: FestivalQuery,
  lookupMode: "focused" | "broad",
): FestivalSourceData[] {
  const activeFestivals = festivals.filter((festival) =>
    isActiveOnVisitDate(festival, query.visitDate),
  );
  const festivalsWithDistance = activeFestivals.map((festival) => ({
    festival,
    distanceKm: getDistanceKm(festival, query.coordinates),
  }));
  const festivalsWithCoordinates = festivalsWithDistance.filter(({ festival }) =>
    hasCoordinates(festival),
  );
  const nearbyFestivalsWithDistance = festivalsWithCoordinates
    .filter(({ distanceKm }) => distanceKm <= query.radiusKm)
    .sort((left, right) => left.distanceKm - right.distanceKm);
  const nearbyFestivals = uniqueFestivalsByEventKey(nearbyFestivalsWithDistance).map(
    ({ festival }) => festival,
  );

  logFestivalFilterCounts({
    rawCount: festivals.length,
    activeCount: activeFestivals.length,
    missingCoordinateCount: festivalsWithDistance.length - festivalsWithCoordinates.length,
    nearbyCount: nearbyFestivalsWithDistance.length,
    deduplicatedNearbyCount: nearbyFestivals.length,
    visitDate: query.visitDate,
    radiusKm: query.radiusKm,
    lookupMode,
  });

  return nearbyFestivals;
}

function createFocusedFestivalRequests(query: FestivalQuery): Array<{
  venue?: string;
  roadAddress?: string;
}> {
  return [
    ...(query.destinationName !== undefined ? [{ venue: query.destinationName }] : []),
    ...(query.address !== undefined ? [{ roadAddress: query.address }] : []),
  ];
}

function isActiveOnVisitDate(festival: FestivalSourceData, visitDate: string): boolean {
  if (!isIsoDate(festival.startDate) || !isIsoDate(festival.endDate) || !isIsoDate(visitDate)) {
    return false;
  }

  return festival.startDate <= visitDate && visitDate <= festival.endDate;
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

function hasCoordinates(festival: FestivalSourceData): boolean {
  return festival.latitude !== undefined && festival.longitude !== undefined;
}

function uniqueFestivalsByEventKey<TFestival extends { festival: FestivalSourceData }>(
  festivals: TFestival[],
): TFestival[] {
  const seenKeys = new Set<string>();
  const uniqueFestivals: TFestival[] = [];

  for (const festival of festivals) {
    const key = createEventKey(festival.festival);

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    uniqueFestivals.push(festival);
  }

  return uniqueFestivals;
}

function createEventKey(festival: FestivalSourceData): string {
  return [festival.name, festival.startDate, festival.endDate, festival.venue, festival.phoneNumber]
    .map((value) => normalizeEventKeyPart(value))
    .join("|");
}

function normalizeEventKeyPart(value: string | undefined): string {
  return value?.trim().replaceAll(/\s+/g, "").toLowerCase() ?? "";
}

function logFestivalFilterCounts(context: {
  rawCount: number;
  activeCount: number;
  missingCoordinateCount: number;
  nearbyCount: number;
  deduplicatedNearbyCount: number;
  visitDate: string;
  radiusKm: number;
  lookupMode: "focused" | "broad";
}): void {
  console.error("[FestivalAdapter] festival filter counts", context);
}
