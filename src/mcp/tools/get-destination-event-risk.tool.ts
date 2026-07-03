import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import { createToolResult } from "./tool-result.js";

const sourceSchema = z.object({
  name: z.string(),
  status: z.enum(["SUCCESS", "NO_DATA", "FAILED"]),
  description: z.string().optional(),
});

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

export const getDestinationEventRiskInputSchema = {
  destination: z.string().trim().min(1).optional(),
  destinationName: z.string().trim().min(1).optional(),
  contentId: z.string().trim().min(1).optional(),
  visitDate: z.iso.date(),
  radiusKm: z.number().min(0.1).max(20).default(3),
};

export const getDestinationEventRiskOutputSchema = {
  status: z.enum(["SUCCESS", "NO_DATA", "AMBIGUOUS_DESTINATION", "FAILED"]),
  message: z.string().optional(),
  destination: destinationSchema.optional(),
  visitDate: z.iso.date(),
  radiusKm: z.number().positive(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]).optional(),
  festivals: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        venue: z.string().optional(),
        address: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        distanceKm: z.number().optional(),
        phoneNumber: z.string().optional(),
        referenceDate: z.string().optional(),
      }),
    )
    .optional(),
  cautions: z.array(z.string()),
  candidates: z.array(candidateSchema).optional(),
  sources: z.array(sourceSchema),
};

export function registerGetDestinationEventRiskTool(
  server: McpServer,
  container: AppContainer,
): void {
  server.registerTool(
    "get_destination_event_risk",
    {
      title: "Get Destination Event Risk",
      description:
        "Accessible Visit MCP(무장애 방문 MCP): 방문일에 관광지 주변 축제를 조회하고 행사 기반 혼잡 위험을 반환합니다.",
      inputSchema: getDestinationEventRiskInputSchema,
      outputSchema: getDestinationEventRiskOutputSchema,
      annotations: {
        title: "Get Destination Event Risk",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      return createToolResult(
        await container.services.destinationEventRiskToolService.execute(input),
      );
    },
  );
}
