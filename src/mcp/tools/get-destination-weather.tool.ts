import { z } from "zod/v4";

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
