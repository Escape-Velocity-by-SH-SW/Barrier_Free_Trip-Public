import type { AccessibilityLookupResult, AccessibilityService } from "./accessibility.service.js";
import type { DestinationResolver } from "./destination-resolver.js";
import type { AccessibilityFacilities, TravelerType } from "../../domain/accessibility.js";
import { travelerTypes } from "../../domain/accessibility.js";
import type {
  Destination,
  DestinationCandidate,
  DestinationResolutionResult,
} from "../../domain/destination.js";
import type { OperationContext } from "../ports/operation-context.js";
import { performanceConfig } from "./performance-config.js";
import { runWithDeadline } from "./deadline.js";

export interface DestinationAccessibilityToolRequest {
  destination?: string | undefined;
  destinationName?: string | undefined;
  contentId?: string | undefined;
  contentTypeId?: string | undefined;
  travelerType?: string | undefined;
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

export interface DestinationAccessibilityToolResult {
  status: "SUCCESS" | "NO_DATA" | "AMBIGUOUS_DESTINATION" | "FAILED";
  message?: string;
  destination?: Destination;
  travelerType?: TravelerType;
  facilities?: AccessibilityFacilities;
  cautions?: string[];
  unknowns?: string[];
  candidates?: DestinationCandidateSummary[];
  sources: ToolSource[];
}

export class DestinationAccessibilityToolService {
  constructor(
    private readonly destinationResolver: DestinationResolver,
    private readonly accessibilityService: AccessibilityService,
  ) {}

  async execute(
    request: DestinationAccessibilityToolRequest,
  ): Promise<DestinationAccessibilityToolResult> {
    return runWithDeadline(
      performanceConfig.overallDeadlineMs,
      (context) => this.executeWithinDeadline(request, context),
      request.context,
    );
  }

  private async executeWithinDeadline(
    request: DestinationAccessibilityToolRequest,
    context: OperationContext,
  ): Promise<DestinationAccessibilityToolResult> {
    const contentId = normalizeText(request.contentId);
    const destinationName = getDestinationName(request);
    const travelerType = normalizeTravelerType(request.travelerType);

    if (contentId !== undefined) {
      return this.executeByContentId(request, contentId, destinationName, travelerType, context);
    }

    if (destinationName === undefined) {
      return createFailedResult(
        "관광지명 또는 contentId 중 하나는 반드시 입력해야 합니다.",
        travelerType,
        [],
      );
    }

    const resolution = await this.destinationResolver.resolve(destinationName, context);
    return this.executeResolvedDestination(resolution, travelerType, "name", context);
  }

  private async executeByContentId(
    request: DestinationAccessibilityToolRequest,
    contentId: string,
    destinationName: string | undefined,
    travelerType: TravelerType | undefined,
    context: OperationContext,
  ): Promise<DestinationAccessibilityToolResult> {
    if (destinationName !== undefined) {
      const resolution = await this.destinationResolver.resolveByContentId(
        {
          contentId,
          destinationName,
        },
        context,
      );

      if (resolution.status !== "RESOLVED") {
        return createResolutionFailureResult(resolution, travelerType);
      }

      return this.executeResolvedDestination(resolution, travelerType, "contentId", context);
    }

    const contentTypeId = normalizeText(request.contentTypeId);
    const result = await this.accessibilityService.getAccessibilityByContentId({
      contentId,
      ...(contentTypeId !== undefined ? { contentTypeId } : {}),
      ...(travelerType !== undefined ? { travelerType } : {}),
      context,
    });

    return {
      ...result,
      message: createContentIdAccessibilityMessage(result.status),
      sources: [
        {
          name: "한국관광공사 detailWithTour2",
          status: result.status,
          description: "contentId 기준 무장애 편의시설 상세 정보를 조회했습니다.",
        },
      ],
    };
  }

  private async executeResolvedDestination(
    resolution: DestinationResolutionResult,
    travelerType: TravelerType | undefined,
    mode: "name" | "contentId",
    context: OperationContext,
  ): Promise<DestinationAccessibilityToolResult> {
    if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
      return createResolutionFailureResult(resolution, travelerType);
    }

    const result = await this.accessibilityService.getAccessibility({
      destination: resolution.destination,
      ...(travelerType !== undefined ? { travelerType } : {}),
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
          name: "한국관광공사 detailWithTour2",
          status: result.status,
          description: "contentId 기준 무장애 편의시설 상세 정보를 조회했습니다.",
        },
      ],
    };
  }
}

function createContentIdAccessibilityMessage(status: AccessibilityLookupResult["status"]): string {
  if (status === "SUCCESS") {
    return "contentId 기준 접근성 상세 정보를 조회했습니다. 관광지명, 주소, 좌표는 확정하지 못했습니다.";
  }

  if (status === "NO_DATA") {
    return "contentId 기준 접근성 상세 정보를 조회했지만 제공된 편의시설 정보가 없습니다.";
  }

  return "contentId 기준 접근성 상세 정보를 조회하지 못했습니다.";
}

function createResolutionFailureResult(
  resolution: DestinationResolutionResult,
  travelerType: TravelerType | undefined,
): DestinationAccessibilityToolResult {
  if (resolution.status === "FAILED") {
    return createFailedResult("관광지 검색 정보를 조회하지 못했습니다.", travelerType, [
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
      ...(travelerType !== undefined ? { travelerType } : {}),
      candidates: toCandidateSummaries(resolution.candidates ?? []),
      cautions: ["후보 중 하나의 contentId를 선택해 같은 Tool을 다시 호출하세요."],
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
    ...(travelerType !== undefined ? { travelerType } : {}),
    cautions: ["입력한 관광지명으로 검색된 후보가 없습니다."],
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
  travelerType: TravelerType | undefined,
  sources: ToolSource[],
): DestinationAccessibilityToolResult {
  return {
    status: "FAILED",
    message: caution,
    ...(travelerType !== undefined ? { travelerType } : {}),
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

function getDestinationName(request: DestinationAccessibilityToolRequest): string | undefined {
  return normalizeText(request.destinationName) ?? normalizeText(request.destination);
}

function normalizeTravelerType(value: string | undefined): TravelerType | undefined {
  if (value === "WHEELCHAIR") {
    return "POWER_WHEELCHAIR";
  }

  if (value === "ELDERLY") {
    return "ELDERLY_COMPANION";
  }

  return travelerTypes.some((travelerType) => travelerType === value)
    ? (value as TravelerType)
    : undefined;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalizedValue = value?.trim();
  return normalizedValue !== undefined && normalizedValue.length > 0 ? normalizedValue : undefined;
}
