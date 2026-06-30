import type {
  WeatherQuery,
  WeatherRepository,
} from "../../application/ports/weather.repository.js";
import type { WeatherSourceData } from "../../domain/weather.js";
import { resolveKmaForecastBaseTime } from "./kma-forecast-time.js";
import { convertLatLngToKmaGrid } from "./kma-grid.js";
import { KmaWeatherApiClient } from "./kma-weather-api.client.js";
import { mapKmaVilageForecastResponse } from "./kma-weather.mapper.js";

export type KmaWeatherClock = () => Date;

export class KmaWeatherAdapter implements WeatherRepository {
  constructor(
    private readonly client: KmaWeatherApiClient,
    private readonly clock: KmaWeatherClock = () => new Date(),
  ) {}

  async getForecast(query: WeatherQuery): Promise<WeatherSourceData> {
    const grid = convertLatLngToKmaGrid(query.coordinates);
    const baseTime = resolveKmaForecastBaseTime(this.clock());
    const dto = await this.client.getVilageForecast({
      baseDate: baseTime.baseDate,
      baseTime: baseTime.baseTime,
      nx: grid.nx,
      ny: grid.ny,
      numOfRows: 1_000,
    });
    const sourceData = mapKmaVilageForecastResponse(dto);

    return {
      ...sourceData,
      forecasts: sourceData.forecasts.filter((forecast) =>
        forecast.forecastAt.startsWith(query.visitDate),
      ),
    };
  }
}
