import type { ChargerService } from "./charger.service.js";
import type { DestinationResolver } from "./destination-resolver.js";
import type { NearbyWheelchairChargerResult } from "../../domain/charger.js";
import type {
  Destination,
  DestinationCandidate,
  DestinationResolutionStatus,
} from "../../domain/destination.js";

export interface NearbyWheelchairChargersToolRequest {
  destination: string;
  radiusKm?: number;
}

export interface DestinationCandidateSummary {
  contentId: string;
  contentTypeId: string;
  name: string;
  address?: string;
  coordinates: Destination["coordinates"];
  imageUrl?: string;
}

export type NearbyWheelchairChargersToolResult =
  | {
      status: "SUCCESS";
      result: NearbyWheelchairChargerResult;
    }
  | {
      status: "AMBIGUOUS_DESTINATION";
      message: string;
      candidates: DestinationCandidateSummary[];
      cautions: string[];
    }
  | {
      status: "FAILED";
      errorMessage: string;
    };

export class NearbyWheelchairChargersToolService {
  constructor(
    private readonly destinationResolver: DestinationResolver,
    private readonly chargerService: ChargerService,
  ) {}

  async execute(
    request: NearbyWheelchairChargersToolRequest,
  ): Promise<NearbyWheelchairChargersToolResult> {
    const resolution = await this.destinationResolver.resolve(request.destination);

    if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
      if (resolution.status === "AMBIGUOUS_DESTINATION") {
        return {
          status: "AMBIGUOUS_DESTINATION",
          message: "관광지가 여러 개 검색되었습니다. 후보 중 하나를 선택해 다시 요청해주세요.",
          candidates: toCandidateSummaries(resolution.candidates ?? []),
          cautions: ["후보 중 하나의 contentId를 선택해 관광지를 더 구체적으로 지정하세요."],
        };
      }

      return {
        status: "FAILED",
        errorMessage: createDestinationResolutionErrorMessage(resolution.status),
      };
    }

    return {
      status: "SUCCESS",
      result: await this.chargerService.findNearbyChargers({
        destination: resolution.destination,
        ...(request.radiusKm !== undefined ? { radiusKm: request.radiusKm } : {}),
      }),
    };
  }
}

function createDestinationResolutionErrorMessage(status: DestinationResolutionStatus): string {
  if (status === "AMBIGUOUS_DESTINATION") {
    return "AMBIGUOUS_DESTINATION: 관광지가 여러 개 검색되었습니다. 관광지명을 더 구체적으로 입력해주세요.";
  }

  if (status === "NO_DATA") {
    return "NO_DATA: 입력한 관광지명으로 검색된 후보가 없습니다.";
  }

  return "FAILED: 관광지 검색 정보를 조회하지 못했습니다.";
}

function toCandidateSummaries(candidates: DestinationCandidate[]): DestinationCandidateSummary[] {
  return candidates.slice(0, 5).map((candidate) => ({
    contentId: candidate.contentId,
    contentTypeId: candidate.contentTypeId,
    name: candidate.name,
    ...(candidate.address !== undefined ? { address: candidate.address } : {}),
    coordinates: candidate.coordinates,
    ...(candidate.imageUrl !== undefined ? { imageUrl: candidate.imageUrl } : {}),
  }));
}
