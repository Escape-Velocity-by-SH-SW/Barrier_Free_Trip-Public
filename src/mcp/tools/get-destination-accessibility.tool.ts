import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import { travelerTypes } from "../../domain/accessibility.js";

const evidenceItemSchema = z.object({
  status: z.enum(["CONFIRMED", "NOT_AVAILABLE", "NOT_PROVIDED", "CONFLICTING"]),
  description: z.string().optional(),
});

export const getDestinationAccessibilityInputSchema = {
  destination: z.string().trim().min(1),
  travelerType: z.enum(travelerTypes).optional(),
};

export const getDestinationAccessibilityOutputSchema = {
  status: z.enum(["SUCCESS", "NO_DATA", "FAILED"]),
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
  travelerType: z.enum(travelerTypes).optional(),
  facilities: z.object({
    parking: evidenceItemSchema,
    route: evidenceItemSchema,
    entrance: evidenceItemSchema,
    elevator: evidenceItemSchema,
    restroom: evidenceItemSchema,
    wheelchairRental: evidenceItemSchema,
    stroller: evidenceItemSchema,
    lactationRoom: evidenceItemSchema,
  }),
  cautions: z.array(z.string()),
  unknowns: z.array(z.string()),
};

export function registerGetDestinationAccessibilityTool(
  server: McpServer,
  container: AppContainer,
): void {
  void container;

  server.registerTool(
    "get_destination_accessibility",
    {
      title: "Get Destination Accessibility",
      description: "관광지의 무장애 편의시설 정보를 조회합니다.",
      inputSchema: getDestinationAccessibilityInputSchema,
      outputSchema: getDestinationAccessibilityOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    () => ({
      isError: true,
      content: [
        {
          type: "text",
          text: "NOT_IMPLEMENTED: 관광공사 접근성 API와 Application Service 연결은 아직 구현되지 않았습니다.",
        },
      ],
    }),
  );
}
