import type { FestivalRepository } from "../../application/ports/festival.repository.js";
import type { FestivalQuery } from "../../application/ports/festival.repository.js";
import type { Coordinates } from "../../domain/destination.js";
import type { FestivalSourceData } from "../../domain/festival.js";
import { calculateDistanceKm } from "../../domain/geo.js";
import type { FestivalApiClient } from "./festival-api.client.js";
import { mapFestivalResponseToSourceData } from "./festival.mapper.js";
import type { OperationContext } from "../../application/ports/operation-context.js";
import { CachedLoader, type CachedLoaderOptions } from "../cache/cached-loader.js";

export type FestivalClient = Pick<FestivalApiClient, "getAllFestivals">;

export class FestivalAdapter implements FestivalRepository {
  private readonly datasetLoader: CachedLoader<"nationwide", FestivalSourceData[]>;
  private readonly dateIndexLoader: CachedLoader<string, FestivalSourceData[]>;

  constructor(
    private readonly client: FestivalClient,
    cacheOptions: {
      readonly dataset: CachedLoaderOptions;
      readonly dateIndex: CachedLoaderOptions;
    },
  ) {
    this.datasetLoader = new CachedLoader("festival", {
      ...cacheOptions.dataset,
      cacheLayer: "dataset",
    });
    this.dateIndexLoader = new CachedLoader("festival", {
      ...cacheOptions.dateIndex,
      cacheLayer: "dateIndex",
    });
  }

  async findNearby(
    query: FestivalQuery,
    context?: OperationContext,
  ): Promise<FestivalSourceData[]> {
    const activeFestivals = await this.dateIndexLoader.load(query.visitDate, context, async () => {
      const festivals = await this.getMappedFestivals(context);
      return festivals.filter((festival) => isActiveOnVisitDate(festival, query.visitDate));
    });
    return filterNearbyFestivals(activeFestivals, query);
  }

  private getMappedFestivals(context?: OperationContext): Promise<FestivalSourceData[]> {
    return this.datasetLoader.load("nationwide", context, async () => {
      const response = await this.client.getAllFestivals(context);
      return mapFestivalResponseToSourceData(response);
    });
  }
}

function filterNearbyFestivals(
  festivals: FestivalSourceData[],
  query: FestivalQuery,
): FestivalSourceData[] {
  const festivalsWithDistance = festivals.map((festival) => ({
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

  return nearbyFestivals;
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
