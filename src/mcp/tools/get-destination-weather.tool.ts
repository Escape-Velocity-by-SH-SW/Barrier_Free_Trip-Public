import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import { travelerTypes } from "../../domain/accessibility.js";

const precipitationTypes = ["NONE", "RAIN", "RAIN_SNOW", "SNOW", "SHOWER", "UNKNOWN"] as const;

const weatherRiskLevels = ["LOW", "CAUTION", "HIGH"] as const;

const weatherRiskTypes = ["HEAT", "COLD", "RAIN", "HEAVY_RAIN", "SNOW", "ICY_ROAD"] as const;

/** get_destination_weather tool이 MCP client로부터 받는 입력 계약이다. */
export const getDestinationWeatherInputSchema = {
  destination: z.string().trim().min(1),
  coordinates: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  visitDate: z.iso.date(),
  travelerType: z.enum(travelerTypes).optional(),
};

/** WeatherService의 DestinationWeatherResult를 MCP structuredContent로 노출하는 출력 계약이다. */
export const getDestinationWeatherOutputSchema = {
  status: z.enum(["AVAILABLE", "OUT_OF_RANGE", "NO_DATA", "FAILED"]),
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
        "관광지 좌표와 방문일을 기준으로 이동 조건에 필요한 날씨 유의사항을 조회합니다.",
      inputSchema: getDestinationWeatherInputSchema,
      outputSchema: getDestinationWeatherOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (input) => {
      const result = await getDestinationWeather(input, container);

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

/** Tool 입력을 WeatherService의 좌표 기반 조회 요청으로 변환한다. */
async function getDestinationWeather(
  input: GetDestinationWeatherInput,
  container: AppContainer,
): Promise<GetDestinationWeatherOutput> {
  return container.services.weatherService.getDestinationWeatherByCoordinates({
    destinationName: input.destination,
    coordinates: input.coordinates,
    visitDate: input.visitDate,
    ...(input.travelerType !== undefined ? { travelerType: input.travelerType } : {}),
  });
}
