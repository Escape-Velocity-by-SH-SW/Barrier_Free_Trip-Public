import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import type { AppContainer } from "../../bootstrap/create-container.js";
import { createToolResult } from "./tool-result.js";
import { createToolObservation } from "../../application/services/tool-observation.js";

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

const operatingHoursSchema = z.object({
  weekdayStart: z.string().optional(),
  weekdayEnd: z.string().optional(),
  saturdayStart: z.string().optional(),
  saturdayEnd: z.string().optional(),
  holidayStart: z.string().optional(),
  holidayEnd: z.string().optional(),
});

export const findNearbyWheelchairChargersInputSchema = {
  destination: z.string().trim().min(1),
  radiusKm: z.number().min(0.1).max(20).default(3),
};

export const findNearbyWheelchairChargersOutputSchema = {
  status: z.enum(["SUCCESS", "NO_DATA", "FAILED", "NOT_APPLICABLE", "AMBIGUOUS_DESTINATION"]),
  message: z.string().optional(),
  destination: destinationSchema.optional(),
  radiusKm: z.number().positive().optional(),
  chargers: z
    .array(
      z.object({
        name: z.string(),
        address: z.string().optional(),
        installationLocationDescription: z.string().optional(),
        distanceKm: z.number().nonnegative(),
        managingOrganization: z.string().optional(),
        phoneNumber: z.string().optional(),
        referenceDate: z.string().optional(),
        operatingHours: operatingHoursSchema.optional(),
        dataFreshness: z.enum(["FRESH", "STALE", "UNKNOWN"]),
        realtimeAvailability: z.literal("UNKNOWN"),
      }),
    )
    .optional(),
  cautions: z.array(z.string()),
  candidates: z.array(candidateSchema).optional(),
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
        "[Bopok(보폭)] Find nearby rapid charging stations for powered wheelchairs around a destination.",
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
      const observation = createToolObservation("find_nearby_wheelchair_chargers");
      try {
        const result = await container.services.nearbyWheelchairChargersToolService.execute({
          ...input,
          context: observation.context,
        });
        observation.summary({ status: result.status });

        if (result.status === "AMBIGUOUS_DESTINATION") {
          return createToolResult(result);
        }

        if (result.status === "FAILED") {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: result.errorMessage,
              },
            ],
          };
        }

        return createToolResult(result.result);
      } catch (error) {
        observation.error(error);
        throw error;
      }
    },
  );
}
