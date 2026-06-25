import type { AccessibilitySourceData } from "../../domain/accessibility.js";
import type { DestinationCandidate } from "../../domain/destination.js";

export interface TourismAccessibilityRepository {
  searchDestination(keyword: string): Promise<DestinationCandidate[]>;

  getAccessibility(contentId: string, contentTypeId: string): Promise<AccessibilitySourceData>;
}
