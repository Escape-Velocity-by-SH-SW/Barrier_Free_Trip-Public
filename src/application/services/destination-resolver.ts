import type { TourismAccessibilityRepository } from "../ports/tourism-accessibility.repository.js";
import type {
  Destination,
  DestinationCandidate,
  DestinationResolutionResult,
} from "../../domain/destination.js";
import type { OperationContext } from "../ports/operation-context.js";

export class DestinationResolver {
  constructor(private readonly repository: TourismAccessibilityRepository) {}

  async resolve(
    destinationName: string,
    context?: OperationContext,
  ): Promise<DestinationResolutionResult> {
    const keyword = destinationName.trim();

    if (keyword.length === 0) {
      return { status: "NO_DATA" };
    }

    let candidates: DestinationCandidate[];

    try {
      candidates = await this.repository.searchDestination(keyword, context);
    } catch {
      return { status: "FAILED" };
    }

    if (candidates.length === 0) {
      return { status: "NO_DATA" };
    }

    const exactCandidates = candidates.filter((candidate) => candidate.matchType === "EXACT");
    const exactCandidate = exactCandidates.at(0);

    if (exactCandidates.length === 1 && exactCandidate !== undefined) {
      return {
        status: "RESOLVED",
        destination: toDestination(exactCandidate),
      };
    }

    const onlyCandidate = candidates.at(0);

    if (candidates.length === 1 && onlyCandidate !== undefined) {
      return {
        status: "RESOLVED",
        destination: toDestination(onlyCandidate),
      };
    }

    return {
      status: "AMBIGUOUS_DESTINATION",
      candidates,
    };
  }

  async resolveByContentId(
    request: {
      contentId: string;
      destinationName: string;
    },
    context?: OperationContext,
  ): Promise<DestinationResolutionResult> {
    const contentId = request.contentId.trim();

    if (contentId.length === 0) {
      return { status: "NO_DATA" };
    }

    const destinationName = request.destinationName.trim();

    if (destinationName.length === 0) {
      return { status: "NO_DATA" };
    }

    let candidates: DestinationCandidate[];

    try {
      candidates = await this.repository.searchDestination(destinationName, context);
    } catch {
      return { status: "FAILED" };
    }

    const selectedCandidate = candidates.find((candidate) => candidate.contentId === contentId);

    if (selectedCandidate === undefined) {
      return {
        status: candidates.length > 0 ? "AMBIGUOUS_DESTINATION" : "NO_DATA",
        candidates,
      };
    }

    return {
      status: "RESOLVED",
      destination: toDestination(selectedCandidate),
    };
  }
}

function toDestination(candidate: DestinationCandidate): Destination {
  const { normalizedName, matchType, imageUrl, ...destination } = candidate;
  void normalizedName;
  void matchType;
  void imageUrl;

  return destination;
}
