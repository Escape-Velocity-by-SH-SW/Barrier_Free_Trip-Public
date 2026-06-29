import type {
  HourlyForecast,
  LightningRisk,
  PrecipitationType,
  SkyCondition,
  WeatherSourceData,
} from "../../domain/weather.js";
import type {
  KmaUltraSrtForecastItemDto,
  KmaUltraSrtForecastResponseDto,
} from "./kma-weather.dto.js";

type ForecastPatch = Omit<HourlyForecast, "forecastAt">;

const WIND_DIRECTIONS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
  "N",
] as const;

export function mapKmaUltraSrtForecastResponse(
  dto: KmaUltraSrtForecastResponseDto,
): WeatherSourceData {
  const items = dto.response.body?.items?.item ?? [];
  const firstItem = items[0];

  return {
    baseDate: firstItem?.baseDate ?? "",
    baseTime: firstItem?.baseTime ?? "",
    forecasts: mapForecastItems(items),
  };
}

export const mapKmaVilageForecastResponse = mapKmaUltraSrtForecastResponse;

function mapForecastItems(items: KmaUltraSrtForecastItemDto[]): HourlyForecast[] {
  const forecastsByTime = new Map<string, ForecastPatch>();

  for (const item of items) {
    const forecastAt = formatKmaForecastAt(item.fcstDate, item.fcstTime);
    const previous = forecastsByTime.get(forecastAt) ?? {};

    forecastsByTime.set(forecastAt, {
      ...previous,
      ...mapForecastCategory(item),
    });
  }

  return Array.from(forecastsByTime.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([forecastAt, forecast]) => ({
      forecastAt,
      ...forecast,
    }));
}

function mapForecastCategory(item: KmaUltraSrtForecastItemDto): ForecastPatch {
  switch (item.category) {
    case "T1H":
      return mapNumberValue("temperatureCelsius", item.fcstValue);
    case "RN1":
      return mapPrecipitationAmount(item.fcstValue);
    case "SKY":
      return { skyCondition: mapSkyCondition(item.fcstValue) };
    case "UUU":
      return mapNumberValue("eastWestWindComponentMps", item.fcstValue);
    case "VVV":
      return mapNumberValue("northSouthWindComponentMps", item.fcstValue);
    case "REH":
      return mapNumberValue("humidityPercent", item.fcstValue);
    case "PTY":
      return { precipitationType: mapPrecipitationType(item.fcstValue) };
    case "POP":
      return mapNumberValue("precipitationProbabilityPercent", item.fcstValue);
    case "LGT":
      return { lightningRisk: mapLightningRisk(item.fcstValue) };
    case "VEC":
      return mapWindDirection(item.fcstValue);
    case "WSD":
      return mapNumberValue("windSpeedMps", item.fcstValue);
    default:
      return {};
  }
}

function mapNumberValue<Key extends keyof ForecastPatch>(
  key: Key,
  value: string | null,
): ForecastPatch {
  const numberValue = parseKmaNumber(value);

  if (numberValue === undefined) {
    return {};
  }

  return { [key]: numberValue };
}

function mapPrecipitationAmount(value: string | null): ForecastPatch {
  if (value === null || value === "-" || value === "0") {
    return {
      precipitationAmountMm: 0,
      precipitationAmountDescription: "강수없음",
    };
  }

  if (value === "1mm 미만") {
    return {
      precipitationAmountMm: 0.5,
      precipitationAmountDescription: value,
    };
  }

  const matched = value.match(/\d+(?:\.\d+)?/);

  if (matched === null) {
    return {};
  }

  const numericValue = parseKmaNumber(matched[0]);

  if (numericValue === undefined) {
    return {};
  }

  return {
    precipitationAmountMm: numericValue,
    precipitationAmountDescription: value,
  };
}

function mapPrecipitationType(value: string | null): PrecipitationType {
  switch (value) {
    case "0":
      return "NONE";
    case "1":
      return "RAIN";
    case "2":
      return "RAIN_SNOW";
    case "3":
      return "SNOW";
    case "4":
      return "SHOWER";
    case "5":
      return "RAINDROP";
    case "6":
      return "RAINDROP_SNOW_FLURRY";
    case "7":
      return "SNOW_FLURRY";
    default:
      return "UNKNOWN";
  }
}

function mapSkyCondition(value: string | null): SkyCondition {
  switch (value) {
    case "1":
      return "CLEAR";
    case "3":
      return "CLOUDY";
    case "4":
      return "OVERCAST";
    default:
      return "UNKNOWN";
  }
}

function mapLightningRisk(value: string | null): LightningRisk {
  const lightning = parseKmaNumber(value);

  if (lightning === undefined) {
    return "UNKNOWN";
  }

  return lightning > 0 ? "POSSIBLE" : "NONE";
}

function mapWindDirection(value: string | null): ForecastPatch {
  const degree = parseKmaNumber(value);

  if (degree === undefined) {
    return {};
  }

  return {
    windDirectionDegree: degree,
    windDirectionText: parseWindDirectionText(degree),
  };
}

function parseKmaNumber(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  if (parsed >= 900 || parsed <= -900) {
    return undefined;
  }

  return parsed;
}

function parseWindDirectionText(degree: number): string {
  const index = Math.floor((degree + 11.25) / 22.5);

  return WIND_DIRECTIONS[index] ?? "UNKNOWN";
}

function formatKmaForecastAt(fcstDate: string, fcstTime: string): string {
  const year = fcstDate.slice(0, 4);
  const month = fcstDate.slice(4, 6);
  const day = fcstDate.slice(6, 8);
  const hour = fcstTime.slice(0, 2);
  const minute = fcstTime.slice(2, 4);

  return `${year}-${month}-${day}T${hour}:${minute}:00+09:00`;
}
