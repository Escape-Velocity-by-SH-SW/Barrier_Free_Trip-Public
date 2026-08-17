import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import type { OperationContext } from "../../application/ports/operation-context.js";
import { travelerTypes } from "../../domain/accessibility.js";
import { createToolResult } from "./tool-result.js";
import { createToolObservation } from "../../application/services/tool-observation.js";

const precipitationTypes = ["NONE", "RAIN", "RAIN_SNOW", "SNOW", "SHOWER", "UNKNOWN"] as const;

const weatherRiskLevels = ["LOW", "CAUTION", "HIGH"] as const;

const weatherRiskTypes = ["HEAT", "COLD", "RAIN", "HEAVY_RAIN", "SNOW", "ICY_ROAD"] as const;

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

/** get_destination_weather tool이 MCP client로부터 받는 입력 계약이다. */
export const getDestinationWeatherInputSchema = {
  destination: z.string().trim().min(1),
  visitDate: z.iso.date(),
  travelerType: z.enum(travelerTypes).optional(),
};

/** WeatherService의 DestinationWeatherResult를 MCP structuredContent로 노출하는 출력 계약이다. */
export const getDestinationWeatherOutputSchema = {
  status: z.enum(["AVAILABLE", "OUT_OF_RANGE", "NO_DATA", "FAILED", "AMBIGUOUS_DESTINATION"]),
  message: z.string().optional(),
  destination: destinationSchema.optional(),
  visitDate: z.iso.date(),
  travelerType: z.enum(travelerTypes).optional(),
  forecasts: z.array(
    z.object({
      forecastDate: z.iso.date(),
      minTemperatureCelsius: z.number().optional(),
      maxTemperatureCelsius: z.number().optional(),
      maxPrecipitationProbabilityPercent: z.number().min(0).max(100).optional(),
      maxPrecipitationAmountMm: z.number().optional(),
      precipitationAmountDescription: z.string().optional(),
      precipitationTypes: z.array(z.enum(precipitationTypes)),
    }),
  ),
  risk: z.object({
    riskLevel: z.enum(weatherRiskLevels),
    riskTypes: z.array(z.enum(weatherRiskTypes)),
    cautions: z.array(z.string()),
  }),
  candidates: z.array(candidateSchema).optional(),
  sources: z.array(sourceSchema),
};

type GetDestinationWeatherInput = z.output<z.ZodObject<typeof getDestinationWeatherInputSchema>>;
type GetDestinationWeatherOutput = z.output<z.ZodObject<typeof getDestinationWeatherOutputSchema>>;

/** get_destination_weather MCP tool을 등록하고 WeatherService 결과를 structuredContent로 반환한다. */
export function registerGetDestinationWeatherTool(
  server: McpServer,
  container: AppContainer,
): void {
  server.registerTool(
    "get_destination_weather",
    {
      title: "Get Destination Weather",
      description:
        "[Bopok(보폭)] Get weather-related mobility cautions for a destination and visit date.",
      inputSchema: getDestinationWeatherInputSchema,
      outputSchema: getDestinationWeatherOutputSchema,
      annotations: {
        title: "Get Destination Weather",
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
        idempotentHint: true,
      },
    },
    async (input) => {
      const observation = createToolObservation("get_destination_weather");
      try {
        const result = await getDestinationWeather(input, container, observation.context);
        observation.summary({ status: result.status });
        return createToolResult(result);
      } catch (error) {
        observation.error(error);
        throw error;
      }
    },
  );
}

/** Tool 입력을 관광지 검색 기반 날씨 조회 요청으로 변환한다. */
async function getDestinationWeather(
  input: GetDestinationWeatherInput,
  container: AppContainer,
  context: OperationContext,
): Promise<GetDestinationWeatherOutput> {
  return container.services.destinationWeatherToolService.execute({
    destination: input.destination,
    visitDate: input.visitDate,
    ...(input.travelerType !== undefined ? { travelerType: input.travelerType } : {}),
    context,
  });
}
