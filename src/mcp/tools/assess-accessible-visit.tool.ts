import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import { VisitAssessmentDestinationResolutionError } from "../../application/services/visit-assessment.service.js";
import { toLoggableError } from "../../application/services/logging.js";
import { travelerTypes } from "../../domain/accessibility.js";
import type { Destination, DestinationCandidate, DestinationResolutionStatus } from "../../domain/destination.js";
import { buildAccessibleVisitWidgetEnvelope } from "../widgets/accessible-visit.widget.js";
import { createWidgetToolResult } from "../widgets/widget-result.js";
import { createToolResult } from "./tool-result.js";

const destinationSchema = z.object({
  name: z.string(),
  contentId: z.string(),
  contentTypeId: z.string(),
  address: z.string().optional(),
  coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
});

const candidateSchema = z.object({
  contentId: z.string(),
  contentTypeId: z.string(),
  name: z.string(),
  address: z.string().optional(),
  coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  imageUrl: z.string().optional(),
});

export const assessAccessibleVisitInputSchema = {
  destination: z.string().trim().min(1),
  contentId: z.string().trim().min(1).optional(),
  visitDate: z.iso.date(),
  travelerType: z.enum(travelerTypes),
  radiusKm: z.number().min(0.1).max(20).default(3),
};

export const assessAccessibleVisitOutputSchema = {
  status: z.enum(["SUCCESS", "NO_DATA", "AMBIGUOUS_DESTINATION", "FAILED"]),
  message: z.string().optional(),
  destination: destinationSchema.optional(),
  visit: z.object({
    date: z.iso.date(),
    travelerType: z.enum(travelerTypes),
    radiusKm: z.number().positive(),
  }).optional(),
  overallAssessment: z.object({
    status: z.enum([
      "LIKELY_ACCESSIBLE",
      "ACCESSIBLE_WITH_CAUTION",
      "CHECK_REQUIRED",
      "INSUFFICIENT_DATA",
    ]),
    reasons: z.array(z.string()),
  }).optional(),
  accessibility: z.unknown().optional(),
  weather: z.unknown().optional(),
  chargers: z.unknown().optional(),
  festivalRisk: z.unknown().optional(),
  combinedCautions: z.array(
    z.object({
      code: z.string(),
      level: z.enum(["LOW", "MEDIUM", "HIGH"]),
      domains: z.array(z.enum(["ACCESSIBILITY", "WEATHER", "CHARGER", "FESTIVAL"])),
      message: z.string(),
      evidence: z.array(z.string()),
    }),
  ).optional(),
  unknowns: z.array(z.string()).optional(),
  checklist: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      required: z.boolean(),
    }),
  ).optional(),
  phoneCheckQuestions: z.array(z.string()).optional(),
  candidates: z.array(candidateSchema).optional(),
  cautions: z.array(z.string()).optional(),
  sources: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["SUCCESS", "NO_DATA", "FAILED"]),
      description: z.string().optional(),
    }),
  ).optional(),
};

export function registerAssessAccessibleVisitTool(
  server: McpServer,
  container: AppContainer,
): void {
  server.registerTool(
    "assess_accessible_visit",
    {
      title: "Assess Accessible Visit",
      description:
        "[Bopok(보폭)] Assess a destination visit by combining accessibility facilities, weather, nearby wheelchair chargers, and local event risk into practical visit cautions.",
      inputSchema: assessAccessibleVisitInputSchema,
      outputSchema: assessAccessibleVisitOutputSchema,
      annotations: {
        title: "Assess Accessible Visit",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      try {
        const result = await container.services.visitAssessmentService.assess({
          destination: input.destination,
          ...(input.contentId !== undefined ? { contentId: input.contentId } : {}),
          visitDate: input.visitDate,
          travelerType: input.travelerType,
          radiusKm: input.radiusKm,
        });

        const output = {
          status: "SUCCESS",
          ...result,
        };

        return createWidgetToolResult(output, {
          buildEnvelope: () => buildAccessibleVisitWidgetEnvelope(result),
        });
      } catch (error) {
        console.error("[assess_accessible_visit] failed to assess visit", {
          destination: input.destination,
          visitDate: input.visitDate,
          travelerType: input.travelerType,
          error: toLoggableError(error),
        });

        if (!(error instanceof VisitAssessmentDestinationResolutionError)) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: "FAILED: 종합 방문 평가 처리 중 오류가 발생했습니다.",
              },
            ],
          };
        }

        return createToolResult(
          createDestinationResolutionResult(
            error.status,
            error.candidates,
            input,
          ),
        );
      }
    },
  );
}

function createDestinationResolutionResult(
  status: DestinationResolutionStatus,
  candidates: DestinationCandidate[],
  input: {
    destination: string;
    visitDate: string;
    travelerType: (typeof travelerTypes)[number];
    radiusKm: number;
  },
): {
  status: "NO_DATA" | "AMBIGUOUS_DESTINATION" | "FAILED";
  message: string;
  visit: {
    date: string;
    travelerType: (typeof travelerTypes)[number];
    radiusKm: number;
  };
  candidates?: Array<DestinationCandidateSummary>;
  cautions: string[];
  sources: Array<{
    name: string;
    status: "SUCCESS" | "NO_DATA" | "FAILED";
    description?: string;
  }>;
} {
  if (status === "AMBIGUOUS_DESTINATION") {
    return {
      status: "AMBIGUOUS_DESTINATION",
      message: "관광지가 여러 개 검색되었습니다. 후보 중 하나를 선택해 다시 요청해주세요.",
      visit: {
        date: input.visitDate,
        travelerType: input.travelerType,
        radiusKm: input.radiusKm,
      },
      candidates: toCandidateSummaries(candidates),
      cautions: ["후보 중 하나의 contentId를 선택해 같은 Tool을 다시 호출하세요."],
      sources: [
        {
          name: "한국관광공사 searchKeyword2",
          status: "SUCCESS",
          description: "관광지 후보를 조회했습니다. 후보 확정 전에는 종합 방문 평가를 진행하지 않습니다.",
        },
      ],
    };
  }

  if (status === "NO_DATA") {
    return {
      status: "NO_DATA",
      message: "검색 결과가 없습니다.",
      visit: {
        date: input.visitDate,
        travelerType: input.travelerType,
        radiusKm: input.radiusKm,
      },
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

  return {
    status: "FAILED",
    message: "관광지 검색 정보를 조회하지 못해 종합 방문 평가를 수행하지 못했습니다.",
    visit: {
      date: input.visitDate,
      travelerType: input.travelerType,
      radiusKm: input.radiusKm,
    },
    cautions: ["관광지 검색 정보를 조회하지 못했습니다."],
    sources: [
      {
        name: "한국관광공사 searchKeyword2",
        status: "FAILED",
        description: "관광지명 검색 API 호출에 실패했습니다.",
      },
    ],
  };
}

interface DestinationCandidateSummary {
  contentId: string;
  contentTypeId: string;
  name: string;
  address?: string;
  coordinates: Destination["coordinates"];
  imageUrl?: string;
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
