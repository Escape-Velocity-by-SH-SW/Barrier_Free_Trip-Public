import type { Coordinates } from "../../domain/destination.js";
import type { WeatherSourceData } from "../../domain/weather.js";

export interface WeatherQuery {
  coordinates: Coordinates;
  visitDate: string;
}

export interface WeatherRepository {
  getForecast(query: WeatherQuery): Promise<WeatherSourceData>;
}
