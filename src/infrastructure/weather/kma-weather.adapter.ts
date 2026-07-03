import type {
  WeatherQuery,
  WeatherRepository,
} from "../../application/ports/weather.repository.js";
import type { WeatherSourceData } from "../../domain/weather.js";
import { resolveKmaForecastBaseTime } from "./kma-forecast-time.js";
import { convertLatLngToKmaGrid } from "./kma-grid.js";
import {
  KmaForecastDateNotFoundError,
  KmaWeatherApiClient,
} from "./kma-weather-api.client.js";
import { mapKmaForecastResponse } from "./kma-weather.mapper.js";

export type KmaWeatherClock = () => Date;

/** WeatherRepository 계약을 KMA 단기예보 client/mapper 조합으로 구현한다. */
export class KmaWeatherAdapter implements WeatherRepository {
  constructor(
    private readonly client: KmaWeatherApiClient,
    private readonly clock: KmaWeatherClock = () => new Date(),
  ) {}

  /** 좌표와 방문일 요청을 KMA 격자/기준시각 조회로 바꿔 방문일 일별 예보로 반환한다. */
  async getForecast(query: WeatherQuery): Promise<WeatherSourceData> {
    const grid = convertLatLngToKmaGrid(query.coordinates);
    const baseTime = resolveKmaForecastBaseTime(this.clock());

    try {
      const dto = await this.client.getForecast({
        baseDate: baseTime.baseDate,
        baseTime: baseTime.baseTime,
        visitDate: query.visitDate,
        nx: grid.nx,
        ny: grid.ny,
        numOfRows: 1_000,
      });

      return mapKmaForecastResponse(dto);
    } catch (error) {
      if (error instanceof KmaForecastDateNotFoundError) {
        return {
          baseDate: baseTime.baseDate,
          baseTime: baseTime.baseTime,
          forecasts: [],
        };
      }

      throw error;
    }
  }
}
