export interface Coordinates {
  latitude: number;
  longitude: number;
}

export type DestinationResolutionStatus = "RESOLVED" | "NOT_FOUND" | "AMBIGUOUS";

export interface Destination {
  name: string;
  contentId: string;
  contentTypeId: string;
  address?: string;
  coordinates: Coordinates;
}

export interface DestinationCandidate extends Destination {
  normalizedName: string;
  matchType: "EXACT" | "PARTIAL";
}

export interface DestinationResolutionResult {
  status: DestinationResolutionStatus;
  destination?: Destination;
  candidates?: DestinationCandidate[];
}
