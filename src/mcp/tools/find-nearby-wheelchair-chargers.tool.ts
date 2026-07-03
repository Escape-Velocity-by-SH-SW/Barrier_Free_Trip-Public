import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { AppContainer } from "../../bootstrap/create-container.js";
import type { NearbyWheelchairChargerResult } from "../../domain/charger.js";

export const findNearbyWheelchairChargersInputSchema = {
  destination: z.string().trim().min(1),
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
      description:
        "Accessible Visit MCP(무장애 방문 MCP): 관광지 주변 전동휠체어 급속충전소를 조회합니다.",
      inputSchema: findNearbyWheelchairChargersInputSchema,
      outputSchema: findNearbyWheelchairChargersOutputSchema,
      annotations: {
        title: "Find Nearby Wheelchair Chargers",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      const resolution = await container.services.destinationResolver.resolve(input.destination);

      if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: createDestinationResolutionErrorMessage(resolution.status),
            },
          ],
        };
      }

      return createToolResult(
        await container.services.chargerService.findNearbyChargers({
          destination: resolution.destination,
        }),
      );
    },
  );
}

function createToolResult(output: NearbyWheelchairChargerResult): {
  structuredContent: Record<string, unknown>;
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    structuredContent: output as unknown as Record<string, unknown>,
    content: [
      {
        type: "text",
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}

function createDestinationResolutionErrorMessage(status: string): string {
  if (status === "AMBIGUOUS_DESTINATION") {
    return "AMBIGUOUS_DESTINATION: 관광지가 여러 개 검색되었습니다. 관광지명을 더 구체적으로 입력해주세요.";
  }

  if (status === "NO_DATA") {
    return "NO_DATA: 입력한 관광지명으로 검색된 후보가 없습니다.";
  }

  return "FAILED: 관광지 검색 정보를 조회하지 못했습니다.";
}
