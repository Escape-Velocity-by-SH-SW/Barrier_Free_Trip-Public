import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import { createToolResult } from "./tool-result.js";
import { createToolObservation } from "../../application/services/tool-observation.js";

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
  destination: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Place name to search for. Required unless contentId is provided together with it — contentId alone is not enough to resolve coordinates for distance calculation.",
    ),
  contentId: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Content ID from a previous search. Must be provided together with destination — contentId alone fails because coordinates cannot be resolved from it.",
    ),
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
        "[Bopok(보폭)] Check nearby festivals and events for a destination and visit date to estimate event-based crowding risk.",
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
      const observation = createToolObservation("get_destination_event_risk");
      try {
        const result = await container.services.destinationEventRiskToolService.execute({
          ...input,
          context: observation.context,
        });
        observation.summary({ status: result.status });
        return createToolResult(result);
      } catch (error) {
        observation.error(error);
        throw error;
      }
    },
  );
}
