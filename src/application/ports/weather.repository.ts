import type { Coordinates } from "../../domain/destination.js";
import type { WeatherSourceData } from "../../domain/weather.js";
import type { OperationContext } from "./operation-context.js";

export interface WeatherQuery {
  coordinates: Coordinates;
  visitDate: string;
}

export interface WeatherRepository {
  getForecast(query: WeatherQuery, context?: OperationContext): Promise<WeatherSourceData>;
}
