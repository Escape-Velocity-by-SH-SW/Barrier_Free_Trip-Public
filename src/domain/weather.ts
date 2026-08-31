import type { Destination } from "./destination.js";
import type { TravelerType } from "./accessibility.js";

export type PrecipitationType =
  | "NONE"
  | "RAIN"
  | "RAIN_SNOW"
  | "SNOW"
  | "SHOWER"
  | "UNKNOWN";

export type WeatherRiskLevel = "LOW" | "CAUTION" | "HIGH";

export type WeatherRiskType =
  | "HEAT"
  | "COLD"
  | "RAIN"
  | "HEAVY_RAIN"
  | "SNOW"
  | "ICY_ROAD";

export interface DailyWeatherForecast {
  /**
   * 예보 대상 날짜
   * 예: 2026-07-02
   */
  forecastDate: string;

  /**
   * 일 최저기온(℃)
   * KMA category: TMN
   */
  minTemperatureCelsius?: number;

  /**
   * 일 최고기온(℃)
   * KMA category: TMX
   */
  maxTemperatureCelsius?: number;

  /**
   * 해당 날짜의 최대 강수확률(%)
   * KMA category: POP
   */
  maxPrecipitationProbabilityPercent?: number;

  /**
   * 해당 날짜의 최대 1시간 강수량 대표값(mm)
   * KMA category: PCP
   */
  maxPrecipitationAmountMm?: number;

  /**
   * 최대 강수량에 해당하는 원본 설명
   * 예: "강수없음", "1mm 미만", "30.0~50.0mm", "50.0mm 이상"
   */
  precipitationAmountDescription?: string;

  /**
   * 해당 날짜에 등장한 강수형태들
   * KMA category: PTY
   */
  precipitationTypes: PrecipitationType[];
}

export interface WeatherSourceData {
  baseDate: string;
  baseTime: string;
  forecasts: DailyWeatherForecast[];
}

export interface WeatherRiskAssessment {
  riskLevel: WeatherRiskLevel;
  riskTypes: WeatherRiskType[];
  cautions: string[];
}

export interface DestinationWeatherResult {
  status: "AVAILABLE" | "OUT_OF_RANGE" | "NO_DATA" | "FAILED";
  destination: Destination;
  visitDate: string;
  travelerType?: TravelerType;
  forecasts: DailyWeatherForecast[];
  risk: WeatherRiskAssessment;
}
