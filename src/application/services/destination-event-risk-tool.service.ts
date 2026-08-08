import type { DestinationResolver } from "./destination-resolver.js";
import type { FestivalRiskService } from "./festival-risk.service.js";
import type {
  Destination,
  DestinationCandidate,
  DestinationResolutionResult,
} from "../../domain/destination.js";
import type { FestivalRiskLevel, NearbyFestival } from "../../domain/festival.js";
import type { OperationContext } from "../ports/operation-context.js";
import { performanceConfig } from "./performance-config.js";
import { runWithDeadline } from "./deadline.js";

export interface DestinationEventRiskToolRequest {
  destination?: string | undefined;
  destinationName?: string | undefined;
  contentId?: string | undefined;
  visitDate: string;
  radiusKm: number;
  context?: OperationContext;
}

export interface DestinationCandidateSummary {
  contentId: string;
  contentTypeId: string;
  name: string;
  address?: string;
  coordinates: Destination["coordinates"];
  imageUrl?: string;
}

export interface ToolSource {
  name: string;
  status: "SUCCESS" | "NO_DATA" | "FAILED";
  description?: string;
}

export interface DestinationEventRiskToolResult {
  status: "SUCCESS" | "NO_DATA" | "AMBIGUOUS_DESTINATION" | "FAILED";
  message?: string;
  destination?: Destination;
  visitDate: string;
  radiusKm: number;
  riskLevel?: FestivalRiskLevel;
  festivals?: NearbyFestival[];
  cautions: string[];
  candidates?: DestinationCandidateSummary[];
  sources: ToolSource[];
}

export class DestinationEventRiskToolService {
  constructor(
    private readonly destinationResolver: DestinationResolver,
    private readonly festivalRiskService: FestivalRiskService,
  ) {}

  async execute(request: DestinationEventRiskToolRequest): Promise<DestinationEventRiskToolResult> {
    return runWithDeadline(
      performanceConfig.overallDeadlineMs,
      (context) => this.executeWithinDeadline(request, context),
      request.context,
    );
  }

  private async executeWithinDeadline(
    request: DestinationEventRiskToolRequest,
    context: OperationContext,
  ): Promise<DestinationEventRiskToolResult> {
    const contentId = normalizeText(request.contentId);
    const destinationName = getDestinationName(request);

    if (contentId !== undefined) {
      if (destinationName === undefined) {
        return createFailedResult(
          "축제 위험 조회는 거리 계산을 위한 좌표가 필요합니다. contentId만으로는 좌표를 확정할 수 없으므로 destinationName을 함께 입력해주세요.",
          request,
          [],
        );
      }

      const resolution = await this.destinationResolver.resolveByContentId(
        {
          contentId,
          destinationName,
        },
        context,
      );
      return this.executeResolvedDestination(resolution, request, "contentId", context);
    }

    if (destinationName === undefined) {
      return createFailedResult(
        "관광지명 또는 contentId 중 하나는 반드시 입력해야 합니다.",
        request,
        [],
      );
    }

    const resolution = await this.destinationResolver.resolve(destinationName, context);
    return this.executeResolvedDestination(resolution, request, "name", context);
  }

  private async executeResolvedDestination(
    resolution: DestinationResolutionResult,
    request: DestinationEventRiskToolRequest,
    mode: "name" | "contentId",
    context: OperationContext,
  ): Promise<DestinationEventRiskToolResult> {
    if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
      return createResolutionFailureResult(resolution, request);
    }

    const result = await this.festivalRiskService.assess({
      destination: resolution.destination,
      visitDate: request.visitDate,
      radiusKm: request.radiusKm,
      context,
    });

    return {
      ...result,
      sources: [
        {
          name: "한국관광공사 searchKeyword2",
          status: "SUCCESS",
          description:
            mode === "contentId"
              ? "관광지명과 contentId로 후보 중 선택된 관광지를 확정했습니다."
              : "관광지명으로 contentId와 좌표를 식별했습니다.",
        },
        {
          name: "전국문화축제표준데이터",
          status: result.status,
          description: "방문일과 반경 기준으로 주변 축제를 조회했습니다.",
        },
      ],
    };
  }
}

function createResolutionFailureResult(
  resolution: DestinationResolutionResult,
  request: DestinationEventRiskToolRequest,
): DestinationEventRiskToolResult {
  if (resolution.status === "FAILED") {
    return createFailedResult("관광지 검색 정보를 조회하지 못했습니다.", request, [
      {
        name: "한국관광공사 searchKeyword2",
        status: "FAILED",
        description: "관광지명 검색 API 호출에 실패했습니다.",
      },
    ]);
  }

  if (resolution.status === "AMBIGUOUS_DESTINATION") {
    return {
      status: "AMBIGUOUS_DESTINATION",
      message: "관광지가 여러 개 검색되었습니다. 후보 중 하나를 선택해 다시 요청해주세요.",
      visitDate: request.visitDate,
      radiusKm: request.radiusKm,
      cautions: ["후보 중 하나의 contentId를 선택해 같은 Tool을 다시 호출하세요."],
      candidates: toCandidateSummaries(resolution.candidates ?? []),
      sources: [
        {
          name: "한국관광공사 searchKeyword2",
          status: "SUCCESS",
          description: "관광지 후보를 조회했습니다.",
        },
      ],
    };
  }

  return {
    status: "NO_DATA",
    message: "검색 결과가 없습니다.",
    visitDate: request.visitDate,
    radiusKm: request.radiusKm,
    cautions: ["입력한 관광지명 또는 contentId로 관광지를 확정하지 못했습니다."],
    sources: [
      {
        name: "한국관광공사 searchKeyword2",
        status: "NO_DATA",
        description: "검색 결과가 없습니다.",
      },
    ],
  };
}

function createFailedResult(
  caution: string,
  request: DestinationEventRiskToolRequest,
  sources: ToolSource[],
): DestinationEventRiskToolResult {
  return {
    status: "FAILED",
    message: caution,
    visitDate: request.visitDate,
    radiusKm: request.radiusKm,
    riskLevel: "UNKNOWN",
    festivals: [],
    cautions: [caution],
    sources,
  };
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

function getDestinationName(request: DestinationEventRiskToolRequest): string | undefined {
  return normalizeText(request.destinationName) ?? normalizeText(request.destination);
}

function normalizeText(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue !== undefined && normalizedValue.length > 0 ? normalizedValue : undefined;
}
