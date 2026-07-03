import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import { VisitAssessmentDestinationResolutionError } from "../../application/services/visit-assessment.service.js";
import { toLoggableError } from "../../application/services/logging.js";
import { travelerTypes } from "../../domain/accessibility.js";
import type { DestinationResolutionStatus } from "../../domain/destination.js";
import { createToolResult } from "./tool-result.js";

export const assessAccessibleVisitInputSchema = {
  destination: z.string().trim().min(1),
  visitDate: z.iso.date(),
  travelerType: z.enum(travelerTypes),
  radiusKm: z.number().min(0.1).max(20).default(3),
};

export const assessAccessibleVisitOutputSchema = {
  destination: z.object({
    name: z.string(),
    contentId: z.string(),
    contentTypeId: z.string(),
    address: z.string().optional(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
    }),
  }),
  visit: z.object({
    date: z.iso.date(),
    travelerType: z.enum(travelerTypes),
    radiusKm: z.number().positive(),
  }),
  overallAssessment: z.object({
    status: z.enum([
      "LIKELY_ACCESSIBLE",
      "ACCESSIBLE_WITH_CAUTION",
      "CHECK_REQUIRED",
      "INSUFFICIENT_DATA",
    ]),
    reasons: z.array(z.string()),
  }),
  accessibility: z.unknown(),
  weather: z.unknown(),
  chargers: z.unknown(),
  festivalRisk: z.unknown(),
  combinedCautions: z.array(
    z.object({
      code: z.string(),
      level: z.enum(["LOW", "MEDIUM", "HIGH"]),
      domains: z.array(z.enum(["ACCESSIBILITY", "WEATHER", "CHARGER", "FESTIVAL"])),
      message: z.string(),
      evidence: z.array(z.string()),
    }),
  ),
  unknowns: z.array(z.string()),
  checklist: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      required: z.boolean(),
    }),
  ),
  phoneCheckQuestions: z.array(z.string()),
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
        "Accessible Visit MCP(무장애 방문 MCP): 편의시설, 날씨, 충전소, 축제 정보를 함께 조회하여 종합 방문 유의사항을 반환합니다.",
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
        const result = await container.services.visitAssessmentService.assess(input);

        return createToolResult(result);
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

        return {
          isError: true,
          content: [
            {
              type: "text",
              text: createDestinationResolutionErrorMessage(error.status),
            },
          ],
        };
      }
    },
  );
}

function createDestinationResolutionErrorMessage(status: DestinationResolutionStatus): string {
  if (status === "AMBIGUOUS_DESTINATION") {
    return "AMBIGUOUS_DESTINATION: 관광지가 여러 개 검색되었습니다. 관광지명을 더 구체적으로 입력해주세요.";
  }

  if (status === "NO_DATA") {
    return "NO_DATA: 입력한 관광지명으로 검색된 후보가 없습니다.";
  }

  return "FAILED: 관광지 검색 정보를 조회하지 못해 종합 방문 평가를 수행하지 못했습니다.";
}
