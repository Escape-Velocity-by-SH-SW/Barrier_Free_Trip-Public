import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import { travelerTypes } from "../../domain/accessibility.js";

export const getDestinationWeatherInputSchema = {
  destination: z.string().trim().min(1),
  visitDate: z.iso.date(),
  travelerType: z.enum(travelerTypes).optional(),
};

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
      forecastAt: z.string(),
      temperatureCelsius: z.number().optional(),
      precipitationProbabilityPercent: z.number().min(0).max(100).optional(),
      precipitationType: z
        .enum(["NONE", "RAIN", "RAIN_SNOW", "SNOW", "SHOWER", "UNKNOWN"])
        .optional(),
      precipitationAmountMm: z.number().optional(),
      windSpeedMps: z.number().optional(),
      humidityPercent: z.number().optional(),
      skyCondition: z.enum(["CLEAR", "CLOUDY", "OVERCAST", "UNKNOWN"]).optional(),
    }),
  ),
  cautions: z.array(z.string()),
};

type GetDestinationWeatherInput = z.output<z.ZodObject<typeof getDestinationWeatherInputSchema>>;
type GetDestinationWeatherOutput = z.output<z.ZodObject<typeof getDestinationWeatherOutputSchema>>;

export function createMockGetDestinationWeatherResult(
  input: GetDestinationWeatherInput,
): GetDestinationWeatherOutput {
  const result: GetDestinationWeatherOutput = {
    status: "AVAILABLE",
    destination: {
      name: input.destination,
      contentId: "mock-gyeongbokgung-001",
      contentTypeId: "12",
      address: "서울특별시 종로구 사직로 161",
      coordinates: {
        latitude: 37.5796,
        longitude: 126.977,
      },
    },
    visitDate: input.visitDate,
    travelerType: input.travelerType,
    forecasts: [
      {
        forecastAt: `${input.visitDate}T09:00:00+09:00`,
        temperatureCelsius: 24,
        precipitationProbabilityPercent: 20,
        precipitationType: "NONE",
        precipitationAmountMm: 0,
        windSpeedMps: 2.4,
        humidityPercent: 58,
        skyCondition: "CLOUDY",
      },
      {
        forecastAt: `${input.visitDate}T15:00:00+09:00`,
        temperatureCelsius: 27,
        precipitationProbabilityPercent: 30,
        precipitationType: "NONE",
        precipitationAmountMm: 0,
        windSpeedMps: 3.1,
        humidityPercent: 62,
        skyCondition: "OVERCAST",
      },
    ],
    cautions: [
      "MCP 연결 확인을 위한 Mock 날씨 데이터입니다.",
      "실제 기상청 예보가 아니므로 방문 전 공식 예보를 확인하세요.",
    ],
  };

  if (input.travelerType !== undefined) {
    return {
      ...result,
      travelerType: input.travelerType,
    };
  }

  return result;
}

export function registerGetDestinationWeatherTool(
  server: McpServer,
  container: AppContainer,
): void {
  void container;

  server.registerTool(
    "get_destination_weather",
    {
      title: "Get Destination Weather",
      description: "관광지와 방문일을 기준으로 이동 조건에 필요한 날씨 유의사항을 조회합니다.",
      inputSchema: getDestinationWeatherInputSchema,
      outputSchema: getDestinationWeatherOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    (input) => {
      const result = createMockGetDestinationWeatherResult(input);

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
