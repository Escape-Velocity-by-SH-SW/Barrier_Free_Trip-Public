export interface Coordinates {
  latitude: number;
  longitude: number;
}

export const touristAttractionContentTypeId = "12";

export type DestinationResolutionStatus =
  | "RESOLVED"
  | "NO_DATA"
  | "AMBIGUOUS_DESTINATION"
  | "FAILED";

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
  imageUrl?: string;
}

export interface DestinationResolutionResult {
  status: DestinationResolutionStatus;
  destination?: Destination;
  candidates?: DestinationCandidate[];
}
