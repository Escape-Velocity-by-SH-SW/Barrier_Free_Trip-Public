import type { TourismAccessibilityRepository } from "../../application/ports/tourism-accessibility.repository.js";
import type { AccessibilitySourceData } from "../../domain/accessibility.js";
import type { DestinationCandidate } from "../../domain/destination.js";
import type { KoreaTourApiClient } from "./korea-tour-api.client.js";
import {
  mapDetailWithTourResponseToAccessibilitySourceData,
  mapSearchKeywordResponseToDestinationCandidates,
} from "./korea-tour-api.mapper.js";

export class KoreaTourAccessibilityAdapter implements TourismAccessibilityRepository {
  constructor(private readonly client: KoreaTourApiClient) {}

  async searchDestination(keyword: string): Promise<DestinationCandidate[]> {
    const response = await this.client.searchKeyword({ keyword });
    return mapSearchKeywordResponseToDestinationCandidates(response, keyword);
  }

  getAccessibility(
    contentId: string,
    contentTypeId: string,
  ): Promise<AccessibilitySourceData> {
    void contentTypeId;

    return this.client
      .getDetailWithTour({ contentId })
      .then(mapDetailWithTourResponseToAccessibilitySourceData);
  }
}
