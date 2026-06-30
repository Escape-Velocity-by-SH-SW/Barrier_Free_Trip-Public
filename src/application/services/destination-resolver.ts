import type { TourismAccessibilityRepository } from "../ports/tourism-accessibility.repository.js";
import type {
  Destination,
  DestinationCandidate,
  DestinationResolutionResult,
} from "../../domain/destination.js";

export class DestinationResolver {
  constructor(private readonly repository: TourismAccessibilityRepository) {}

  async resolve(destinationName: string): Promise<DestinationResolutionResult> {
    const normalizedDestinationName = normalizeDestinationName(destinationName);

    if (normalizedDestinationName.length === 0) {
      return { status: "NOT_FOUND" };
    }

    const candidates = await this.repository.searchDestination(destinationName.trim());

    if (candidates.length === 0) {
      return { status: "NOT_FOUND" };
    }

    const exactCandidates = candidates.filter(
      (candidate) => candidate.normalizedName === normalizedDestinationName,
    );
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
      status: "AMBIGUOUS",
      candidates: exactCandidates.length > 1 ? exactCandidates : candidates,
    };
  }
}

function toDestination(candidate: DestinationCandidate): Destination {
  const { normalizedName, matchType, ...destination } = candidate;
  void normalizedName;
  void matchType;

  return destination;
}

function normalizeDestinationName(value: string): string {
  return value.trim().replaceAll(/\s+/g, "").toLowerCase();
}
