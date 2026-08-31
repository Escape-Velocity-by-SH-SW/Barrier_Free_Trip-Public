import type { AccessibilityService } from "./accessibility.service.js";
import type { ChargerService } from "./charger.service.js";
import type { DestinationResolver } from "./destination-resolver.js";
import type { FestivalRiskService } from "./festival-risk.service.js";
import type { WeatherService } from "./weather.service.js";
import type {
  AccessibilityFacilities,
  DestinationAccessibilityResult,
  TravelerType,
} from "../../domain/accessibility.js";
import type { NearbyWheelchairChargerResult } from "../../domain/charger.js";
import type {
  Destination,
  DestinationCandidate,
  DestinationResolutionStatus,
} from "../../domain/destination.js";
import type { DestinationFestivalRiskResult } from "../../domain/festival.js";
import type {
  AccessibleVisitAssessment,
  CautionItem,
  ChecklistItem,
  VisitAssessmentStatus,
} from "../../domain/visit-assessment.js";
import type { DestinationWeatherResult } from "../../domain/weather.js";
import type { DownstreamSource, OperationContext } from "../ports/operation-context.js";
import { mapWithConcurrency } from "./concurrency.js";
import { DeadlineExceededError, runWithDeadline } from "./deadline.js";
import { ensureObservedContext, writeToolSummary } from "./tool-observation.js";
import { performanceConfig } from "./performance-config.js";

export interface VisitAssessmentRequest {
  destination: string;
  contentId?: string;
  visitDate: string;
  travelerType: TravelerType;
  radiusKm?: number;
  context?: OperationContext;
}

export interface VisitAssessmentBatchRequest {
  destinations: string[];
  visitDate: string;
  travelerType: TravelerType;
  radiusKm?: number;
  context?: OperationContext;
}

export interface VisitAssessmentBatchItem {
  requestedDestination: string;
  status: "SUCCESS" | "NO_DATA" | "AMBIGUOUS_DESTINATION" | "FAILED";
  assessment?: AccessibleVisitAssessment;
  candidates?: DestinationCandidate[];
  message?: string;
}

export interface VisitAssessmentBatchResult {
  status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";
  requestedCandidateCount: number;
  candidateCount: number;
  results: VisitAssessmentBatchItem[];
}

export interface VisitAssessmentPerformanceOptions {
  overallDeadlineMs: number;
  destinationConcurrency: number;
  responseReserveMs?: number;
  maxSourceBudgetMs?: number;
}

const defaultRadiusKm = 3;
const maxCautionsPerDomain = 5;

type VisitAssessmentSourceResult =
  | DestinationAccessibilityResult
  | DestinationWeatherResult
  | NearbyWheelchairChargerResult
  | DestinationFestivalRiskResult;
type VisitAssessmentSourceStatus = VisitAssessmentSourceResult["status"];

export class VisitAssessmentDestinationResolutionError extends Error {
  constructor(
    readonly status: DestinationResolutionStatus,
    readonly candidates: DestinationCandidate[] = [],
  ) {
    super("Destination could not be resolved for accessible visit assessment.");
    this.name = "VisitAssessmentDestinationResolutionError";
  }
}

export class VisitAssessmentService {
  constructor(
    private readonly destinationResolver: DestinationResolver,
    private readonly accessibilityService: AccessibilityService,
    private readonly weatherService: WeatherService,
    private readonly chargerService: ChargerService,
    private readonly festivalRiskService: FestivalRiskService,
    private readonly performanceOptions: VisitAssessmentPerformanceOptions = {
      overallDeadlineMs: performanceConfig.overallDeadlineMs,
      destinationConcurrency: performanceConfig.destinationConcurrency,
      responseReserveMs: performanceConfig.responseReserveMs,
      maxSourceBudgetMs: performanceConfig.maxSourceBudgetMs,
    },
  ) {}

  async assess(request: VisitAssessmentRequest): Promise<AccessibleVisitAssessment> {
    const observedContext = ensureObservedContext("assess_accessible_visit", request.context);
    const startedAt = performance.now();
    let resolutionLatencyMs = 0;

    try {
      return await runWithDeadline(
        this.performanceOptions.overallDeadlineMs,
        async (context) => {
          const resolutionStartedAt = performance.now();
          const resolution =
            request.contentId !== undefined
              ? await this.destinationResolver.resolveByContentId(
                  {
                    contentId: request.contentId,
                    destinationName: request.destination,
                  },
                  context,
                )
              : await this.destinationResolver.resolve(request.destination, context);
          resolutionLatencyMs = Math.round(performance.now() - resolutionStartedAt);

          if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
            throw new VisitAssessmentDestinationResolutionError(
              resolution.status,
              resolution.candidates ?? [],
            );
          }

          const assessment = await this.assessResolvedDestination(
            request,
            resolution.destination,
            context,
          );
          this.logSummary({
            startedAt,
            requestedCandidateCount: 1,
            candidateCount: 1,
            resolutionLatencyMs,
            results: [assessment],
            context: observedContext,
          });
          return assessment;
        },
        observedContext,
      );
    } catch (error) {
      this.logSummary({
        startedAt,
        requestedCandidateCount: 1,
        candidateCount: 1,
        resolutionLatencyMs,
        results: [],
        context: observedContext,
        failedCandidates: 1,
      });
      throw error;
    }
  }

  async assessBatch(request: VisitAssessmentBatchRequest): Promise<VisitAssessmentBatchResult> {
    const normalizedDestinations = normalizeDestinations(request.destinations);
    const observedContext = ensureObservedContext("assess_accessible_visit", request.context);
    const startedAt = performance.now();
    let resolutionLatencyMs = 0;

    const results = await runWithDeadline(
      this.performanceOptions.overallDeadlineMs,
      (context) =>
        mapWithConcurrency(
          normalizedDestinations,
          this.performanceOptions.destinationConcurrency,
          async (destinationName) => {
            if (context.signal?.aborted === true) {
              return createBatchFailure(
                destinationName,
                "FAILED",
                "전체 처리 시간이 초과되었습니다.",
              );
            }

            const resolutionStartedAt = performance.now();
            const resolution = await this.destinationResolver.resolve(destinationName, context);
            resolutionLatencyMs = Math.max(
              resolutionLatencyMs,
              Math.round(performance.now() - resolutionStartedAt),
            );

            if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
              return createBatchFailure(
                destinationName,
                toBatchStatus(resolution.status),
                createResolutionMessage(resolution.status),
                resolution.candidates,
              );
            }

            const assessment = await this.assessResolvedDestination(
              {
                destination: destinationName,
                visitDate: request.visitDate,
                travelerType: request.travelerType,
                ...(request.radiusKm !== undefined ? { radiusKm: request.radiusKm } : {}),
              },
              resolution.destination,
              context,
            );
            return {
              requestedDestination: destinationName,
              status: "SUCCESS" as const,
              assessment,
            };
          },
        ),
      observedContext,
    );
    const successfulAssessments = results.flatMap((result) =>
      result.assessment !== undefined ? [result.assessment] : [],
    );
    const batchResult: VisitAssessmentBatchResult = {
      status: getBatchOverallStatus(results),
      requestedCandidateCount: request.destinations.length,
      candidateCount: normalizedDestinations.length,
      results,
    };
    this.logSummary({
      startedAt,
      requestedCandidateCount: request.destinations.length,
      candidateCount: normalizedDestinations.length,
      resolutionLatencyMs,
      results: successfulAssessments,
      context: observedContext,
      failedCandidates: results.length - successfulAssessments.length,
    });
    return batchResult;
  }

  private async assessResolvedDestination(
    request: VisitAssessmentRequest,
    destination: Destination,
    context: OperationContext,
  ): Promise<AccessibleVisitAssessment> {
    const radiusKm = request.radiusKm ?? defaultRadiusKm;
    const sourceBudgetMs = calculateSourceBudgetMs(context, this.performanceOptions);
    const [accessibility, weather, chargers, festivalRisk] = await Promise.allSettled([
      runAssessmentSource("accessibility", sourceBudgetMs, context, (sourceContext) =>
        this.accessibilityService.getAccessibility({
          destination,
          travelerType: request.travelerType,
          context: sourceContext,
        }),
      ),
      runAssessmentSource("weather", sourceBudgetMs, context, (sourceContext) =>
        this.weatherService.getDestinationWeather({
          destination,
          visitDate: request.visitDate,
          travelerType: request.travelerType,
          context: sourceContext,
        }),
      ),
      runAssessmentSource("charger", sourceBudgetMs, context, (sourceContext) =>
        this.chargerService.findNearbyChargers({
          destination,
          radiusKm,
          context: sourceContext,
        }),
      ),
      runAssessmentSource("festival", sourceBudgetMs, context, (sourceContext) =>
        this.festivalRiskService.assess({
          destination,
          visitDate: request.visitDate,
          radiusKm,
          context: sourceContext,
        }),
      ),
    ]);

    const accessibilityResult =
      accessibility.status === "fulfilled"
        ? accessibility.value
        : createFailedAccessibilityResult(destination, request.travelerType);
    const weatherResult =
      weather.status === "fulfilled"
        ? weather.value
        : createFailedWeatherResult(destination, request.visitDate, request.travelerType);
    const chargerResult =
      chargers.status === "fulfilled"
        ? chargers.value
        : createFailedChargerResult(destination, radiusKm);
    const festivalRiskResult =
      festivalRisk.status === "fulfilled"
        ? festivalRisk.value
        : createFailedFestivalRiskResult(destination, request.visitDate, radiusKm);
    const combinedCautions = createCombinedCautions(
      accessibilityResult,
      weatherResult,
      chargerResult,
      festivalRiskResult,
    );
    const overallStatus = calculateOverallStatus({
      accessibilityStatus: accessibilityResult.status,
      weatherStatus: weatherResult.status,
      chargerStatus: chargerResult.status,
      festivalStatus: festivalRiskResult.status,
      cautionCount: combinedCautions.length,
    });

    return {
      destination,
      visit: {
        date: request.visitDate,
        travelerType: request.travelerType,
        radiusKm,
      },
      overallAssessment: {
        status: overallStatus,
        reasons: createOverallReasons(overallStatus),
      },
      accessibility: accessibilityResult,
      weather: weatherResult,
      chargers: chargerResult,
      festivalRisk: festivalRiskResult,
      combinedCautions,
      unknowns: createUnknowns(
        accessibilityResult,
        weatherResult,
        chargerResult,
        festivalRiskResult,
      ),
      checklist: createChecklist(request.travelerType),
      phoneCheckQuestions: createPhoneCheckQuestions(request.travelerType),
    };
  }

  private logSummary(input: {
    startedAt: number;
    requestedCandidateCount: number;
    candidateCount: number;
    resolutionLatencyMs: number;
    results: AccessibleVisitAssessment[];
    context: OperationContext;
    failedCandidates?: number;
  }): void {
    const partialResultCount =
      (input.failedCandidates ?? 0) +
      input.results.filter((result) => result.overallAssessment.status === "CHECK_REQUIRED").length;
    const status =
      input.results.length === 0
        ? "FAILED"
        : partialResultCount > 0
          ? "PARTIAL_SUCCESS"
          : "SUCCESS";
    writeToolSummary(
      input.context,
      input.startedAt,
      {
        status,
        requestedCandidateCount: input.requestedCandidateCount,
        candidateCount: input.candidateCount,
        deduplicatedCandidateCount: input.requestedCandidateCount - input.candidateCount,
        destinationResolutionLatencyMs: input.resolutionLatencyMs,
        partialResultCount,
        sourceStatuses: summarizeSourceStatuses(input.results),
      },
      input.context.logWriter,
    );
  }
}

type AssessmentSource = Extract<
  DownstreamSource,
  "accessibility" | "weather" | "charger" | "festival"
>;

function calculateSourceBudgetMs(
  context: OperationContext,
  options: VisitAssessmentPerformanceOptions,
): number {
  const remainingMs =
    context.deadlineAtMs === undefined
      ? options.overallDeadlineMs
      : Math.max(0, context.deadlineAtMs - Date.now());
  const responseReserveMs =
    options.responseReserveMs ??
    Math.min(performanceConfig.responseReserveMs, Math.floor(options.overallDeadlineMs * 0.15));
  const maxSourceBudgetMs = options.maxSourceBudgetMs ?? performanceConfig.maxSourceBudgetMs;
  return Math.max(0, Math.floor(Math.min(maxSourceBudgetMs, remainingMs - responseReserveMs)));
}

async function runAssessmentSource<TResult extends VisitAssessmentSourceResult>(
  source: AssessmentSource,
  budgetMs: number,
  context: OperationContext,
  operation: (context: OperationContext) => Promise<TResult>,
): Promise<TResult> {
  const startedAt = performance.now();

  try {
    const result = await runWithDeadline(budgetMs, operation, context, {
      scope: "source",
      source,
    });
    writeSourceSummary(context, {
      source,
      durationMs: Math.round(performance.now() - startedAt),
      budgetMs,
      status: result.status,
      outcome: result.status === "FAILED" ? "ERROR" : "SUCCESS",
      timeout: false,
      parentAbort: false,
    });
    return result;
  } catch (error) {
    const parentAbort = context.signal?.aborted === true;
    const timeout = !parentAbort && error instanceof DeadlineExceededError;
    writeSourceSummary(context, {
      source,
      durationMs: Math.round(performance.now() - startedAt),
      budgetMs,
      status: "FAILED",
      outcome: parentAbort ? "PARENT_ABORT" : timeout ? "TIMEOUT" : "ERROR",
      timeout,
      parentAbort,
    });
    throw error;
  }
}

function writeSourceSummary(
  context: OperationContext,
  details: {
    readonly source: AssessmentSource;
    readonly durationMs: number;
    readonly budgetMs: number;
    readonly status: string;
    readonly outcome: "SUCCESS" | "ERROR" | "TIMEOUT" | "PARENT_ABORT";
    readonly timeout: boolean;
    readonly parentAbort: boolean;
  },
): void {
  context.logWriter?.({
    timestamp: new Date().toISOString(),
    level: details.outcome === "SUCCESS" ? "info" : "error",
    event: "source.summary",
    ...(context.requestId !== undefined ? { requestId: context.requestId } : {}),
    ...(context.tool !== undefined ? { tool: context.tool } : {}),
    ...details,
  });
}

function normalizeDestinations(destinations: string[]): string[] {
  const normalized = destinations.map((value) => value.trim().replaceAll(/\s+/g, " "));
  const seen = new Set<string>();
  return normalized.filter((value) => {
    const key = value.toLocaleLowerCase("ko-KR");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function toBatchStatus(
  status: DestinationResolutionStatus,
): Exclude<VisitAssessmentBatchItem["status"], "SUCCESS"> {
  return status === "RESOLVED" ? "FAILED" : status;
}

function createResolutionMessage(status: DestinationResolutionStatus): string {
  if (status === "AMBIGUOUS_DESTINATION") {
    return "관광지가 여러 개 검색되었습니다. 후보 중 하나를 선택해 다시 요청해 주세요.";
  }
  if (status === "NO_DATA") {
    return "검색 결과가 없습니다.";
  }
  return "관광지 검색 정보를 조회하지 못했습니다.";
}

function createBatchFailure(
  requestedDestination: string,
  status: Exclude<VisitAssessmentBatchItem["status"], "SUCCESS">,
  message: string,
  candidates?: DestinationCandidate[],
): VisitAssessmentBatchItem {
  return {
    requestedDestination,
    status,
    message,
    ...(candidates !== undefined ? { candidates } : {}),
  };
}

function getBatchOverallStatus(
  results: VisitAssessmentBatchItem[],
): VisitAssessmentBatchResult["status"] {
  const successCount = results.filter((result) => result.status === "SUCCESS").length;
  const hasPartialAssessment = results.some(
    (result) => result.assessment?.overallAssessment.status === "CHECK_REQUIRED",
  );
  if (successCount === results.length && !hasPartialAssessment) {
    return "SUCCESS";
  }
  return successCount > 0 ? "PARTIAL_SUCCESS" : "FAILED";
}

function summarizeSourceStatuses(
  results: AccessibleVisitAssessment[],
): Record<string, Record<string, number>> {
  const summary: Record<string, Record<string, number>> = {};
  for (const result of results) {
    addStatus(summary, "accessibility", result.accessibility.status);
    addStatus(summary, "weather", result.weather.status);
    addStatus(summary, "charger", result.chargers.status);
    addStatus(summary, "festival", result.festivalRisk.status);
  }
  return summary;
}

function addStatus(
  summary: Record<string, Record<string, number>>,
  source: string,
  status: string,
): void {
  const sourceSummary = summary[source] ?? {};
  sourceSummary[status] = (sourceSummary[status] ?? 0) + 1;
  summary[source] = sourceSummary;
}

function createFailedAccessibilityResult(
  destination: Destination,
  travelerType: TravelerType,
): DestinationAccessibilityResult {
  const facilities = createNotProvidedFacilities();

  return {
    status: "FAILED",
    destination,
    travelerType,
    facilities,
    cautions: ["무장애 편의시설 정보를 조회하지 못했습니다. 방문 전 현장에 문의해 확인하세요."],
    unknowns: Object.keys(facilities),
  };
}

function createFailedWeatherResult(
  destination: Destination,
  visitDate: string,
  travelerType: TravelerType,
): DestinationWeatherResult {
  return {
    status: "FAILED",
    destination,
    visitDate,
    travelerType,
    forecasts: [],
    risk: {
      riskLevel: "CAUTION",
      riskTypes: [],
      cautions: ["날씨 정보를 조회하지 못했습니다. 방문 전 공식 예보를 확인하세요."],
    },
  };
}

function createFailedChargerResult(
  destination: Destination,
  radiusKm: number,
): NearbyWheelchairChargerResult {
  return {
    status: "FAILED",
    destination,
    radiusKm,
    chargers: [],
    cautions: ["전동휠체어 충전소 정보를 조회하지 못했습니다."],
  };
}

function createFailedFestivalRiskResult(
  destination: Destination,
  visitDate: string,
  radiusKm: number,
): DestinationFestivalRiskResult {
  return {
    status: "FAILED",
    destination,
    visitDate,
    radiusKm,
    riskLevel: "UNKNOWN",
    festivals: [],
    cautions: ["축제 정보를 조회하지 못했습니다. 방문 전 현장 공지와 교통 상황을 확인하세요."],
  };
}

function createNotProvidedFacilities(): AccessibilityFacilities {
  return {
    parking: { status: "NOT_PROVIDED" },
    route: { status: "NOT_PROVIDED" },
    entrance: { status: "NOT_PROVIDED" },
    elevator: { status: "NOT_PROVIDED" },
    restroom: { status: "NOT_PROVIDED" },
    wheelchairRental: { status: "NOT_PROVIDED" },
    stroller: { status: "NOT_PROVIDED" },
    lactationRoom: { status: "NOT_PROVIDED" },
  };
}

function createCombinedCautions(
  accessibility: DestinationAccessibilityResult,
  weather: DestinationWeatherResult,
  chargers: NearbyWheelchairChargerResult,
  festivalRisk: DestinationFestivalRiskResult,
): CautionItem[] {
  return [
    ...toCautionItems("ACCESSIBILITY", accessibility.cautions, accessibility.status),
    // 날씨 조회 자체가 실패(FAILED)하면 실패 안내 대신 날씨 항목을 응답에서 통째로 제외한다.
    ...(weather.status === "FAILED"
      ? []
      : toCautionItems("WEATHER", weather.risk.cautions, weather.status)),
    ...toCautionItems("CHARGER", chargers.cautions, chargers.status),
    ...toCautionItems("FESTIVAL", festivalRisk.cautions, festivalRisk.status),
  ];
}

function toCautionItems(
  domain: CautionItem["domains"][number],
  messages: string[],
  status: VisitAssessmentSourceStatus,
): CautionItem[] {
  return messages.slice(0, maxCautionsPerDomain).map((message, index) => ({
    code: `${domain}_${index + 1}`,
    level: getCautionLevel(domain, status),
    domains: [domain],
    message,
    evidence: [message],
  }));
}

function getCautionLevel(
  domain: CautionItem["domains"][number],
  status: VisitAssessmentSourceStatus,
): CautionItem["level"] {
  if (status === "FAILED") {
    return "HIGH";
  }

  if (status === "NO_DATA" || status === "OUT_OF_RANGE" || status === "NOT_APPLICABLE") {
    return "MEDIUM";
  }

  return domain === "WEATHER" || domain === "FESTIVAL" ? "MEDIUM" : "LOW";
}

function createUnknowns(
  accessibility: DestinationAccessibilityResult,
  weather: DestinationWeatherResult,
  chargers: NearbyWheelchairChargerResult,
  festivalRisk: DestinationFestivalRiskResult,
): string[] {
  return [
    ...accessibility.unknowns,
    // FAILED는 날씨 항목 자체를 제외하므로 "unknown"으로도 남기지 않는다.
    ...(weather.status === "NO_DATA" || weather.status === "OUT_OF_RANGE" ? ["날씨 정보"] : []),
    ...(chargers.status === "FAILED" || chargers.status === "NO_DATA"
      ? ["전동휠체어 충전소 정보"]
      : []),
    ...(festivalRisk.status === "FAILED" || festivalRisk.status === "NO_DATA"
      ? ["축제 기반 혼잡 위험 정보"]
      : []),
  ];
}

function calculateOverallStatus(input: {
  accessibilityStatus: "SUCCESS" | "NO_DATA" | "FAILED";
  weatherStatus: "AVAILABLE" | "OUT_OF_RANGE" | "NO_DATA" | "FAILED";
  chargerStatus: "SUCCESS" | "NO_DATA" | "FAILED" | "NOT_APPLICABLE";
  festivalStatus: "SUCCESS" | "NO_DATA" | "FAILED";
  cautionCount: number;
}): VisitAssessmentStatus {
  // weatherStatus FAILED는 응답에서 날씨 항목 자체를 제외하므로 전체 상태 판정에 반영하지 않는다.
  if (
    input.accessibilityStatus === "FAILED" ||
    input.chargerStatus === "FAILED" ||
    input.festivalStatus === "FAILED"
  ) {
    return "CHECK_REQUIRED";
  }

  if (input.accessibilityStatus === "NO_DATA" || input.weatherStatus === "NO_DATA") {
    return "INSUFFICIENT_DATA";
  }

  return input.cautionCount > 0 ? "ACCESSIBLE_WITH_CAUTION" : "LIKELY_ACCESSIBLE";
}

function createOverallReasons(status: VisitAssessmentStatus): string[] {
  if (status === "LIKELY_ACCESSIBLE") {
    return ["조회된 공공데이터 기준 주요 위험 신호가 크지 않습니다."];
  }

  if (status === "ACCESSIBLE_WITH_CAUTION") {
    return ["방문은 가능해 보이나 확인해야 할 유의사항이 있습니다."];
  }

  if (status === "CHECK_REQUIRED") {
    return ["일부 정보를 조회하지 못해 방문 전 현장 확인이 필요합니다."];
  }

  return ["방문 가능 여부를 판단하기에 필요한 데이터가 부족합니다."];
}

function createChecklist(travelerType: TravelerType): ChecklistItem[] {
  return [
    {
      code: "CALL_DESTINATION",
      label: "방문지에 핵심 편의시설 운영 여부 확인",
      required: true,
    },
    {
      code: "CHECK_WEATHER",
      label: "방문 당일 공식 예보 재확인",
      required: true,
    },
    {
      code: "CHECK_ROUTE",
      label: "주차장, 출입구, 엘리베이터 동선 확인",
      required: travelerType !== "STROLLER",
    },
    {
      code: "CHECK_CHARGER",
      label: "전동휠체어 충전소 운영 여부 확인",
      required: travelerType === "POWER_WHEELCHAIR",
    },
  ];
}

function createPhoneCheckQuestions(travelerType: TravelerType): string[] {
  const questions = [
    "장애인 주차장, 접근로, 장애인 화장실을 현재 이용할 수 있나요?",
    "방문 예정일에 공사, 행사, 통제 구간이 있나요?",
  ];

  if (travelerType === "POWER_WHEELCHAIR") {
    questions.push("전동휠체어 충전 또는 대기 가능한 장소가 있나요?");
  }

  if (travelerType === "STROLLER") {
    questions.push("유모차 이동 가능한 엘리베이터와 수유실을 이용할 수 있나요?");
  }

  return questions;
}
