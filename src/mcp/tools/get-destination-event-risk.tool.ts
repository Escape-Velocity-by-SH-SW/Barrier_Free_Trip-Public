import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";

export const getDestinationEventRiskInputSchema = {
  destination: z.string().trim().min(1),
  visitDate: z.iso.date(),
  radiusKm: z.number().min(0.1).max(20).default(3),
};

export const getDestinationEventRiskOutputSchema = {
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
  visitDate: z.iso.date(),
  radiusKm: z.number().positive(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  festivals: z.array(
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
  ),
  cautions: z.array(z.string()),
};

export function registerGetDestinationEventRiskTool(
  server: McpServer,
  container: AppContainer,
): void {
  void container;

  server.registerTool(
    "get_destination_event_risk",
    {
      title: "Get Destination Event Risk",
      description: "방문일에 관광지 주변 축제를 조회하고 행사 기반 혼잡 위험을 반환합니다.",
      inputSchema: getDestinationEventRiskInputSchema,
      outputSchema: getDestinationEventRiskOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    () => ({
      isError: true,
      content: [
        {
          type: "text",
          text: "NOT_IMPLEMENTED: 축제 API와 Application Service 연결은 아직 구현되지 않았습니다.",
        },
      ],
    }),
  );
}
