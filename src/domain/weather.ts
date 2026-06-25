import type { Destination } from "./destination.js";
import type { TravelerType } from "./accessibility.js";

export type PrecipitationType = "NONE" | "RAIN" | "RAIN_SNOW" | "SNOW" | "SHOWER" | "UNKNOWN";

export type SkyCondition = "CLEAR" | "CLOUDY" | "OVERCAST" | "UNKNOWN";

export interface HourlyForecast {
  forecastAt: string;
  temperatureCelsius?: number;
  precipitationProbabilityPercent?: number;
  precipitationType?: PrecipitationType;
  precipitationAmountMm?: number;
  windSpeedMps?: number;
  humidityPercent?: number;
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
