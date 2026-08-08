import type { TravelerType } from "../../domain/accessibility.js";
import type {
  Destination,
  DestinationCandidate,
  DestinationResolutionResult,
} from "../../domain/destination.js";
import type { DailyWeatherForecast, WeatherRiskAssessment } from "../../domain/weather.js";
import type { DestinationResolver } from "./destination-resolver.js";
import type { WeatherService } from "./weather.service.js";
import type { OperationContext } from "../ports/operation-context.js";
import { performanceConfig } from "./performance-config.js";
import { runWithDeadline } from "./deadline.js";

export interface DestinationWeatherToolRequest {
  destination: string;
  visitDate: string;
  travelerType?: TravelerType;
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

export interface DestinationWeatherToolResult {
  status: "AVAILABLE" | "OUT_OF_RANGE" | "NO_DATA" | "FAILED" | "AMBIGUOUS_DESTINATION";
  message?: string;
  destination?: Destination;
  visitDate: string;
  travelerType?: TravelerType;
  forecasts: DailyWeatherForecast[];
  risk: WeatherRiskAssessment;
  candidates?: DestinationCandidateSummary[];
  sources: ToolSource[];
}

export class DestinationWeatherToolService {
  constructor(
    private readonly destinationResolver: DestinationResolver,
    private readonly weatherService: WeatherService,
  ) {}

  async execute(request: DestinationWeatherToolRequest): Promise<DestinationWeatherToolResult> {
    return runWithDeadline(performanceConfig.overallDeadlineMs, (context) =>
      this.executeWithinDeadline(request, context),
    );
  }

  private async executeWithinDeadline(
    request: DestinationWeatherToolRequest,
    context: OperationContext,
  ): Promise<DestinationWeatherToolResult> {
    const resolution = await this.destinationResolver.resolve(request.destination, context);

    if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
      return createResolutionFailureResult(resolution, request);
    }

    const result = await this.weatherService.getDestinationWeather({
      destination: resolution.destination,
      visitDate: request.visitDate,
      ...(request.travelerType !== undefined ? { travelerType: request.travelerType } : {}),
      context,
    });

    return {
      ...result,
      sources: [
        {
          name: "한국관광공사 searchKeyword2",
          status: "SUCCESS",
          description: "관광지명으로 contentId와 좌표를 식별했습니다.",
        },
        {
          name: "기상청 단기예보",
          status: toSourceStatus(result.status),
          description: "확정된 관광지 좌표를 기준으로 방문일 예보를 조회했습니다.",
        },
      ],
    };
  }
}

function createResolutionFailureResult(
  resolution: DestinationResolutionResult,
  request: DestinationWeatherToolRequest,
): DestinationWeatherToolResult {
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
      ...(request.travelerType !== undefined ? { travelerType: request.travelerType } : {}),
      forecasts: [],
      risk: createUnavailableRisk([
        "후보 중 하나의 contentId를 선택해 관광지를 더 구체적으로 지정하세요.",
      ]),
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
    ...(request.travelerType !== undefined ? { travelerType: request.travelerType } : {}),
    forecasts: [],
    risk: createUnavailableRisk(["입력한 관광지명으로 관광지를 확정하지 못했습니다."]),
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
  request: DestinationWeatherToolRequest,
  sources: ToolSource[],
): DestinationWeatherToolResult {
  return {
    status: "FAILED",
    message: caution,
    visitDate: request.visitDate,
    ...(request.travelerType !== undefined ? { travelerType: request.travelerType } : {}),
    forecasts: [],
    risk: createUnavailableRisk([caution]),
    sources,
  };
}

function createUnavailableRisk(cautions: string[]): WeatherRiskAssessment {
  return {
    riskLevel: "CAUTION",
    riskTypes: [],
    cautions,
  };
}

function toSourceStatus(status: DestinationWeatherToolResult["status"]): ToolSource["status"] {
  if (status === "AVAILABLE") {
    return "SUCCESS";
  }

  if (status === "FAILED") {
    return "FAILED";
  }

  return "NO_DATA";
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
