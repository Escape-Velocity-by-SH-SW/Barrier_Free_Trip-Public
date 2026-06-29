import type { Destination } from "./destination.js";
import type { TravelerType } from "./accessibility.js";

export type PrecipitationType =
  | "NONE"
  | "RAIN"
  | "RAIN_SNOW"
  | "SNOW"
  | "SHOWER"
  | "RAINDROP"
  | "RAINDROP_SNOW_FLURRY"
  | "SNOW_FLURRY"
  | "UNKNOWN";

export type SkyCondition = "CLEAR" | "CLOUDY" | "OVERCAST" | "UNKNOWN";

export type LightningRisk = "NONE" | "POSSIBLE" | "UNKNOWN";

export interface HourlyForecast {
  forecastAt: string;
  temperatureCelsius?: number;
  precipitationProbabilityPercent?: number;
  precipitationType?: PrecipitationType;
  precipitationAmountMm?: number;
  precipitationAmountDescription?: string;
  windSpeedMps?: number;
  windDirectionDegree?: number;
  windDirectionText?: string;
  eastWestWindComponentMps?: number;
  northSouthWindComponentMps?: number;
  humidityPercent?: number;
  lightningRisk?: LightningRisk;
  skyCondition?: SkyCondition;
}

export interface WeatherSourceData {
  baseDate: string;
  baseTime: string;
  forecasts: HourlyForecast[];
}

export interface DestinationWeatherResult {
  status: "AVAILABLE" | "OUT_OF_RANGE" | "NO_DATA" | "FAILED";
  destination: Destination;
  visitDate: string;
  travelerType?: TravelerType;
  forecasts: HourlyForecast[];
  cautions: string[];
}
