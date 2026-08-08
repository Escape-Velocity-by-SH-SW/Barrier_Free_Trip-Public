import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import { travelerTypes } from "../../domain/accessibility.js";
import { createToolResult } from "./tool-result.js";
import { createToolObservation } from "../../application/services/tool-observation.js";

const evidenceItemSchema = z.object({
  status: z.enum(["CONFIRMED", "NOT_AVAILABLE", "NOT_PROVIDED", "CONFLICTING"]),
  description: z.string().optional(),
});

const toolTravelerTypes = [
  "POWER_WHEELCHAIR",
  "MANUAL_WHEELCHAIR",
  "STROLLER",
  "ELDERLY_COMPANION",
  "WHEELCHAIR",
  "ELDERLY",
  "VISUALLY_IMPAIRED",
  "HEARING_IMPAIRED",
] as const;

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

const facilitiesSchema = z.object({
  parking: evidenceItemSchema,
  route: evidenceItemSchema,
  entrance: evidenceItemSchema,
  elevator: evidenceItemSchema,
  restroom: evidenceItemSchema,
  wheelchairRental: evidenceItemSchema,
  stroller: evidenceItemSchema,
  lactationRoom: evidenceItemSchema,
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

export const getDestinationAccessibilityInputSchema = {
  destination: z.string().trim().min(1).optional(),
  destinationName: z.string().trim().min(1).optional(),
  contentId: z.string().trim().min(1).optional(),
  contentTypeId: z.string().trim().min(1).optional(),
  travelerType: z.enum(toolTravelerTypes).optional(),
};

export const getDestinationAccessibilityOutputSchema = {
  status: z.enum(["SUCCESS", "NO_DATA", "AMBIGUOUS_DESTINATION", "FAILED"]),
  message: z.string().optional(),
  destination: destinationSchema.optional(),
  travelerType: z.enum(travelerTypes).optional(),
  facilities: facilitiesSchema.optional(),
  cautions: z.array(z.string()).optional(),
  unknowns: z.array(z.string()).optional(),
  candidates: z.array(candidateSchema).optional(),
  sources: z.array(sourceSchema),
};

export function registerGetDestinationAccessibilityTool(
  server: McpServer,
  container: AppContainer,
): void {
  server.registerTool(
    "get_destination_accessibility",
    {
      title: "Get Destination Accessibility",
      description:
        "[Bopok(보폭)] Look up accessibility facilities and mobility-related accommodations for a destination.",
      inputSchema: getDestinationAccessibilityInputSchema,
      outputSchema: getDestinationAccessibilityOutputSchema,
      annotations: {
        title: "Get Destination Accessibility",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      const observation = createToolObservation("get_destination_accessibility");
      try {
        const result = await container.services.destinationAccessibilityToolService.execute({
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
