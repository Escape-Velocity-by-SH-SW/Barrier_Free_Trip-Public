import type { AccessibilitySourceData } from "../../domain/accessibility.js";
import type { DestinationCandidate } from "../../domain/destination.js";
import type { OperationContext } from "./operation-context.js";

export interface TourismAccessibilityRepository {
  searchDestination(keyword: string, context?: OperationContext): Promise<DestinationCandidate[]>;

  getAccessibility(
    contentId: string,
    contentTypeId: string,
    context?: OperationContext,
  ): Promise<AccessibilitySourceData>;
}
