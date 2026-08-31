import type {
  DailyWeatherForecast,
  PrecipitationType,
  WeatherSourceData,
} from "../../domain/weather.js";
import type {
  KmaForecastItemDto,
  KmaForecastResponseDto,
} from "./kma-weather.dto.js";

type ForecastAccumulator = {
  forecastDate: string;
  minTemperatureCelsius?: number;
  maxTemperatureCelsius?: number;
  maxPrecipitationProbabilityPercent?: number;
  maxPrecipitationAmountMm?: number;
  precipitationAmountDescription?: string;
  precipitationTypes: Set<PrecipitationType>;
};

type PrecipitationAmount = {
  amountMm: number;
  description: string;
};

/** KMA forecast DTO를 방문일 단위 WeatherSourceData로 변환한다. */
export function mapKmaForecastResponse(dto: KmaForecastResponseDto): WeatherSourceData {
  const items = dto.response.body?.items?.item ?? [];
  const firstItem = items[0];

  return {
    baseDate: firstItem?.baseDate ?? "",
    baseTime: firstItem?.baseTime ?? "",
    forecasts: mapForecastItems(items),
  };
}

/** category별 item 배열을 예보 날짜 단위로 병합해 Service가 쓰는 일별 forecast 목록을 만든다. */
function mapForecastItems(items: KmaForecastItemDto[]): DailyWeatherForecast[] {
  const forecastsByDate = new Map<string, ForecastAccumulator>();

  for (const item of items) {
    const forecastDate = formatKmaForecastDate(item.fcstDate);
    const forecast = forecastsByDate.get(forecastDate) ?? createForecastAccumulator(forecastDate);

    applyForecastCategory(forecast, item);
    forecastsByDate.set(forecastDate, forecast);
  }

  return Array.from(forecastsByDate.values())
    .sort((left, right) => left.forecastDate.localeCompare(right.forecastDate))
    .map(toDailyWeatherForecast);
}

/** 날짜별 집계 중간 객체를 만들고 강수형태 누적 Set을 초기화한다. */
function createForecastAccumulator(forecastDate: string): ForecastAccumulator {
  return {
    forecastDate,
    precipitationTypes: new Set<PrecipitationType>(),
  };
}

/** KMA category 코드를 도메인 일별 forecast의 해당 필드에 반영한다. */
function applyForecastCategory(forecast: ForecastAccumulator, item: KmaForecastItemDto): void {
  switch (item.category) {
    case "POP": {
      const probability = parseKmaNumber(item.fcstValue);
      if (probability !== undefined) {
        forecast.maxPrecipitationProbabilityPercent = maxOptionalNumber(
          forecast.maxPrecipitationProbabilityPercent,
          probability,
        );
      }
      return;
    }
    case "PCP": {
      const precipitationAmount = mapPrecipitationAmount(item.fcstValue);
      if (
        precipitationAmount !== undefined &&
        (forecast.maxPrecipitationAmountMm === undefined ||
          precipitationAmount.amountMm > forecast.maxPrecipitationAmountMm)
      ) {
        forecast.maxPrecipitationAmountMm = precipitationAmount.amountMm;
        forecast.precipitationAmountDescription = precipitationAmount.description;
      }
      return;
    }
    case "PTY":
      forecast.precipitationTypes.add(mapPrecipitationType(item.fcstValue));
      return;
    case "TMN": {
      const temperature = parseKmaNumber(item.fcstValue);
      if (temperature !== undefined) {
        forecast.minTemperatureCelsius = minOptionalNumber(
          forecast.minTemperatureCelsius,
          temperature,
        );
      }
      return;
    }
    case "TMX": {
      const temperature = parseKmaNumber(item.fcstValue);
      if (temperature !== undefined) {
        forecast.maxTemperatureCelsius = maxOptionalNumber(
          forecast.maxTemperatureCelsius,
          temperature,
        );
      }
      return;
    }
    default:
      return;
  }
}

/** PCP 강수량 문자열을 Service 판단용 수치 대표값과 원문 설명으로 정규화한다. */
function mapPrecipitationAmount(value: string | null): PrecipitationAmount | undefined {
  if (value === null || value === "-" || value === "0" || value === "강수없음") {
    return {
      amountMm: 0,
      description: "강수없음",
    };
  }

  if (value === "1mm 미만") {
    return {
      amountMm: 0.5,
      description: value,
    };
  }

  const matched = value.match(/\d+(?:\.\d+)?/);

  if (matched === null) {
    return undefined;
  }

  const numericValue = parseKmaNumber(matched[0]);

  if (numericValue === undefined) {
    return undefined;
  }

  return {
    amountMm: numericValue,
    description: /mm/i.test(value) ? value : `${value}mm`,
  };
}

/** PTY 강수형태 코드를 도메인 강수형태 enum으로 변환한다. */
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
    default:
      return "UNKNOWN";
  }
}

/** optional 숫자 필드에 새 값을 반영할 때 더 작은 값을 선택한다. */
function minOptionalNumber(current: number | undefined, next: number): number {
  return current === undefined ? next : Math.min(current, next);
}

/** optional 숫자 필드에 새 값을 반영할 때 더 큰 값을 선택한다. */
function maxOptionalNumber(current: number | undefined, next: number): number {
  return current === undefined ? next : Math.max(current, next);
}

/** KMA 숫자 문자열을 number로 변환하고 결측/비정상 sentinel 값은 제외한다. */
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

/** 집계 중간 객체를 exactOptionalPropertyTypes에 맞는 최종 일별 forecast로 변환한다. */
function toDailyWeatherForecast(forecast: ForecastAccumulator): DailyWeatherForecast {
  return {
    forecastDate: forecast.forecastDate,
    ...(forecast.minTemperatureCelsius !== undefined
      ? { minTemperatureCelsius: forecast.minTemperatureCelsius }
      : {}),
    ...(forecast.maxTemperatureCelsius !== undefined
      ? { maxTemperatureCelsius: forecast.maxTemperatureCelsius }
      : {}),
    ...(forecast.maxPrecipitationProbabilityPercent !== undefined
      ? { maxPrecipitationProbabilityPercent: forecast.maxPrecipitationProbabilityPercent }
      : {}),
    ...(forecast.maxPrecipitationAmountMm !== undefined
      ? { maxPrecipitationAmountMm: forecast.maxPrecipitationAmountMm }
      : {}),
    ...(forecast.precipitationAmountDescription !== undefined
      ? { precipitationAmountDescription: forecast.precipitationAmountDescription }
      : {}),
    precipitationTypes: sortPrecipitationTypes(forecast.precipitationTypes),
  };
}

/** 강수형태 배열을 항상 같은 순서로 반환해 Service와 응답이 안정적으로 동작하게 한다. */
function sortPrecipitationTypes(precipitationTypes: Set<PrecipitationType>): PrecipitationType[] {
  return Array.from(precipitationTypes).sort(
    (left, right) => precipitationTypeOrder[left] - precipitationTypeOrder[right],
  );
}

const precipitationTypeOrder: Record<PrecipitationType, number> = {
  NONE: 0,
  RAIN: 1,
  RAIN_SNOW: 2,
  SNOW: 3,
  SHOWER: 4,
  UNKNOWN: 5,
};

/** KMA fcstDate(YYYYMMDD)를 도메인 날짜(YYYY-MM-DD)로 변환한다. */
function formatKmaForecastDate(fcstDate: string): string {
  const year = fcstDate.slice(0, 4);
  const month = fcstDate.slice(4, 6);
  const day = fcstDate.slice(6, 8);

  return `${year}-${month}-${day}`;
}
