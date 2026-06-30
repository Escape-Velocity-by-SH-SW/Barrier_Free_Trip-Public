import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";

// TODO: Resolver 연동 전 MCP Inspector 검증을 위한 임시 수동 입력이다.
// 최종 구조에서는 destination 문자열을 DestinationResolver로 확정한 Destination 값으로 대체한다.
const destinationInputSchema = z.object({
  name: z.string().trim().min(1),
  contentId: z.string().trim().min(1),
  contentTypeId: z.string().trim().min(1),
  address: z.string().trim().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const findNearbyWheelchairChargersInputSchema = {
  destination: destinationInputSchema,
  visitDateTime: z.string().optional(),
};

export const findNearbyWheelchairChargersOutputSchema = {
  status: z.enum(["SUCCESS", "NO_DATA", "FAILED", "NOT_APPLICABLE"]),
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
  chargers: z.array(
    z.object({
      name: z.string(),
      address: z.string().optional(),
      installationLocationDescription: z.string().optional(),
      distanceKm: z.number().nonnegative(),
      managingOrganization: z.string().optional(),
      phoneNumber: z.string().optional(),
      referenceDate: z.string().optional(),
      realtimeAvailability: z.literal("UNKNOWN"),
    }),
  ),
  cautions: z.array(z.string()),
};

export function registerFindNearbyWheelchairChargersTool(
  server: McpServer,
  container: AppContainer,
): void {
  server.registerTool(
    "find_nearby_wheelchair_chargers",
    {
      title: "Find Nearby Wheelchair Chargers",
      description: "관광지 주변 전동휠체어 급속충전소를 조회합니다.",
      inputSchema: findNearbyWheelchairChargersInputSchema,
      outputSchema: findNearbyWheelchairChargersOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (input) => {
      const result = await container.services.chargerService.findNearbyChargers({
        destination: {
          name: input.destination.name,
          contentId: input.destination.contentId,
          contentTypeId: input.destination.contentTypeId,
          address: input.destination.address,
          coordinates: {
            latitude: input.destination.latitude,
            longitude: input.destination.longitude,
          },
        },
      });

      return {
        structuredContent: { ...result },
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
