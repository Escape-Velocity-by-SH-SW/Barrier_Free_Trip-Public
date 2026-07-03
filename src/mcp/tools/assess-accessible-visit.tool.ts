import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import { VisitAssessmentDestinationResolutionError } from "../../application/services/visit-assessment.service.js";
import { travelerTypes } from "../../domain/accessibility.js";
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
              text: "FAILED: 관광지를 확정하지 못해 종합 방문 평가를 수행하지 못했습니다.",
            },
          ],
        };
      }
    },
  );
}

function toLoggableError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
    };
  }

  return { value: error };
}
