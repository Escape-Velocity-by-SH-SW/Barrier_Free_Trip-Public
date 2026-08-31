import type { TourismAccessibilityRepository } from "../../application/ports/tourism-accessibility.repository.js";
import type { AccessibilitySourceData } from "../../domain/accessibility.js";
import {
  touristAttractionContentTypeId,
  type DestinationCandidate,
} from "../../domain/destination.js";
import type { OperationContext } from "../../application/ports/operation-context.js";
import { CachedLoader, type CachedLoaderOptions } from "../cache/cached-loader.js";
import type { KoreaTourApiClient } from "./korea-tour-api.client.js";
import {
  mapDetailWithTourResponseToAccessibilitySourceData,
  mapSearchKeywordResponseToDestinationCandidates,
} from "./korea-tour-api.mapper.js";

export type KoreaTourClient = Pick<KoreaTourApiClient, "searchKeyword" | "getDetailWithTour">;

export class KoreaTourAccessibilityAdapter implements TourismAccessibilityRepository {
  private readonly destinationLoader: CachedLoader<string, DestinationCandidate[]>;
  private readonly accessibilityLoader: CachedLoader<string, AccessibilitySourceData>;

  constructor(
    private readonly client: KoreaTourClient,
    cacheOptions: {
      readonly destination: CachedLoaderOptions;
      readonly accessibility: CachedLoaderOptions;
    },
  ) {
    this.destinationLoader = new CachedLoader("tourism", cacheOptions.destination);
    this.accessibilityLoader = new CachedLoader("accessibility", cacheOptions.accessibility);
  }

  async searchDestination(
    keyword: string,
    context?: OperationContext,
  ): Promise<DestinationCandidate[]> {
    const key = normalizeCacheKey(keyword);
    return this.destinationLoader.load(key, context, async (sharedContext) => {
      const response = await this.client.searchKeyword(
        {
          keyword: key,
          contentTypeId: touristAttractionContentTypeId,
          arrange: "A",
        },
        sharedContext,
      );
      return mapSearchKeywordResponseToDestinationCandidates(response, key);
    });
  }

  getAccessibility(
    contentId: string,
    _contentTypeId: string,
    context?: OperationContext,
  ): Promise<AccessibilitySourceData> {
    const key = contentId.trim();
    return this.accessibilityLoader.load(key, context, async (sharedContext) => {
      const response = await this.client.getDetailWithTour({ contentId }, sharedContext);
      return mapDetailWithTourResponseToAccessibilitySourceData(response);
    });
  }
}

function normalizeCacheKey(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}
