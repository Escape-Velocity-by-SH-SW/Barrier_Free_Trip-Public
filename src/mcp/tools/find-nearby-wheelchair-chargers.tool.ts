import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";

export const findNearbyWheelchairChargersInputSchema = {
  destination: z.string().trim().min(1),
  radiusKm: z.number().min(0.1).max(20).default(3),
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
  radiusKm: z.number().positive(),
  chargers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      address: z.string().optional(),
      installationLocation: z.string().optional(),
      distanceKm: z.number().nonnegative(),
      operatingHours: z.string().optional(),
      simultaneousUseCount: z.number().int().nonnegative().optional(),
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
  void container;

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
    () => ({
      isError: true,
      content: [
        {
          type: "text",
          text: "NOT_IMPLEMENTED: 충전소 API와 Application Service 연결은 아직 구현되지 않았습니다.",
        },
      ],
    }),
  );
}
