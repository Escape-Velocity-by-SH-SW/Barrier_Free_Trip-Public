import type { WeatherRepository } from "../ports/weather.repository.js";
import type { TravelerType } from "../../domain/accessibility.js";
import type { Destination } from "../../domain/destination.js";
import type {
  DailyWeatherForecast,
  DestinationWeatherResult,
  WeatherRiskAssessment,
  WeatherRiskType,
} from "../../domain/weather.js";

export interface GetDestinationWeatherRequest {
  destination: Destination;
  visitDate: string;
  travelerType?: TravelerType;
}

interface CreateWeatherResultInput extends GetDestinationWeatherRequest {
  status: DestinationWeatherResult["status"];
  forecasts: DailyWeatherForecast[];
  risk: WeatherRiskAssessment;
}

export type WeatherServiceClock = () => Date;

export class WeatherService {
  constructor(
    private readonly weatherRepository: WeatherRepository,
    private readonly clock: WeatherServiceClock = () => new Date(),
  ) {}

  /** 방문지 좌표와 방문일로 날씨를 조회하고 MCP 응답용 상태/유의사항을 조립한다. */
  async getDestinationWeather(
    request: GetDestinationWeatherRequest,
  ): Promise<DestinationWeatherResult> {
    if (isPastVisitDate(request.visitDate, this.clock())) {
      return createWeatherResult({
        ...request,
        status: "NO_DATA",
        forecasts: [],
        risk: createRiskAssessment({
          cautions: ["과거 방문일의 단기예보 데이터는 조회하지 않습니다."],
        }),
      });
    }

    try {
      const sourceData = await this.weatherRepository.getForecast({
        coordinates: request.destination.coordinates,
        visitDate: request.visitDate,
      });

      if (sourceData.forecasts.length === 0) {
        return createWeatherResult({
          ...request,
          status: "NO_DATA",
          forecasts: [],
          risk: createRiskAssessment({
            cautions: ["해당 방문일에 제공 가능한 단기예보 데이터가 없습니다."],
          }),
        });
      }

      return createWeatherResult({
        ...request,
        status: "AVAILABLE",
        forecasts: sourceData.forecasts,
        risk: buildWeatherRisk(sourceData.forecasts, request.travelerType),
      });
    } catch {
      return createWeatherResult({
        ...request,
        status: "FAILED",
        forecasts: [],
        risk: createRiskAssessment({
          riskLevel: "CAUTION",
          cautions: ["날씨 정보를 조회하지 못했습니다. 방문 전 공식 예보를 확인하세요."],
        }),
      });
    }
  }
}

/** 방문일이 한국 기준 오늘보다 과거인지 판단해 불필요한 외부 API 호출을 막는다. */
function isPastVisitDate(visitDate: string, now: Date): boolean {
  return visitDate < formatKoreaDate(now);
}

/** Date를 한국 시간대의 YYYY-MM-DD 날짜 문자열로 변환한다. */
function formatKoreaDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = getDatePart(parts, "year");
  const month = getDatePart(parts, "month");
  const day = getDatePart(parts, "day");

  return `${year}-${month}-${day}`;
}

/** Intl formatToParts 결과에서 필요한 날짜 조각을 꺼낸다. */
function getDatePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const part = parts.find((item) => item.type === type);

  if (part === undefined) {
    throw new Error(`Missing ${type} in formatted Korea date`);
  }

  return part.value;
}

/** optional travelerType을 exactOptionalPropertyTypes에 맞게 필요한 경우에만 포함한다. */
function createWeatherResult(input: CreateWeatherResultInput): DestinationWeatherResult {
  const result: DestinationWeatherResult = {
    status: input.status,
    destination: input.destination,
    visitDate: input.visitDate,
    forecasts: input.forecasts,
    risk: input.risk,
  };

  if (input.travelerType === undefined) {
    return result;
  }

  return {
    ...result,
    travelerType: input.travelerType,
  };
}

/** 일별 예보 값과 이동 조건을 바탕으로 사용자에게 보여줄 날씨 위험도와 유의사항을 만든다. */
function buildWeatherRisk(
  forecasts: DailyWeatherForecast[],
  travelerType?: TravelerType,
): WeatherRiskAssessment {
  const riskTypes = collectWeatherRiskTypes(forecasts);
  const cautions = createWeatherCautions(riskTypes, travelerType);

  return createRiskAssessment({
    riskLevel: calculateRiskLevel(riskTypes),
    riskTypes,
    cautions,
  });
}

/** 일별 예보 목록에서 강수, 폭염, 한파 등 Service가 노출할 위험 유형을 추출한다. */
function collectWeatherRiskTypes(forecasts: DailyWeatherForecast[]): WeatherRiskType[] {
  const riskTypes = new Set<WeatherRiskType>();

  for (const forecast of forecasts) {
    if (hasRainRisk(forecast)) {
      riskTypes.add("RAIN");
    }

    if (hasHeavyRainRisk(forecast)) {
      riskTypes.add("HEAVY_RAIN");
    }

    if (hasSnowRisk(forecast)) {
      riskTypes.add("SNOW");
    }

    if (hasIcyRoadRisk(forecast)) {
      riskTypes.add("ICY_ROAD");
    }

    if (hasHeatRisk(forecast)) {
      riskTypes.add("HEAT");
    }

    if (hasColdRisk(forecast)) {
      riskTypes.add("COLD");
    }
  }

  return sortWeatherRiskTypes(riskTypes);
}

/** 강수확률, 강수량, 강수형태 중 하나라도 이동 중 비 위험 신호인지 판단한다. */
function hasRainRisk(forecast: DailyWeatherForecast): boolean {
  return (
    (forecast.maxPrecipitationProbabilityPercent !== undefined &&
      forecast.maxPrecipitationProbabilityPercent >= rainProbabilityCautionPercent) ||
    (forecast.maxPrecipitationAmountMm !== undefined && forecast.maxPrecipitationAmountMm > 0) ||
    forecast.precipitationTypes.some(
      (type) => type === "RAIN" || type === "RAIN_SNOW" || type === "SHOWER",
    )
  );
}

/** 최대 1시간 강수량 대표값이 강한 비로 볼 수 있는 수준인지 판단한다. - 필요여부 추가 논의 필요 */
function hasHeavyRainRisk(forecast: DailyWeatherForecast): boolean {
  return (
    forecast.maxPrecipitationAmountMm !== undefined &&
    forecast.maxPrecipitationAmountMm >= heavyRainAmountMm
  );
}

/** 강수형태 중 눈 또는 비/눈이 포함되어 있는지 판단한다. - 필요여부 추가 논의 필요 */
function hasSnowRisk(forecast: DailyWeatherForecast): boolean {
  return forecast.precipitationTypes.some((type) => type === "SNOW" || type === "RAIN_SNOW");
}

/** 눈 예보와 영하권 최저기온이 함께 있어 노면 결빙 가능성을 판단한다. - 필요여부 추가 논의 필요 */
function hasIcyRoadRisk(forecast: DailyWeatherForecast): boolean {
  return (
    hasSnowRisk(forecast) &&
    forecast.minTemperatureCelsius !== undefined &&
    forecast.minTemperatureCelsius <= icyRoadTemperatureCelsius
  );
}

/** 일 최고기온이 폭염 수준인지 판단한다. */
function hasHeatRisk(forecast: DailyWeatherForecast): boolean {
  return (
    forecast.maxTemperatureCelsius !== undefined &&
    forecast.maxTemperatureCelsius >= heatWaveTemperatureCelsius
  );
}

/** 일 최저기온이 한파 수준인지 판단한다. */
function hasColdRisk(forecast: DailyWeatherForecast): boolean {
  return (
    forecast.minTemperatureCelsius !== undefined &&
    forecast.minTemperatureCelsius <= coldWaveTemperatureCelsius
  );
}

/** 위험 유형을 사용자 주의 문구로 변환하고 이동수단별 추가 유의사항을 붙인다. */
function createWeatherCautions(
  riskTypes: WeatherRiskType[],
  travelerType?: TravelerType,
): string[] {
  const cautions: string[] = [];

  if (riskTypes.includes("RAIN")) {
    cautions.push("강수 예보가 있어 미끄럼과 우천 이동 동선을 확인하세요.");
  }

  if (riskTypes.includes("HEAVY_RAIN")) {
    cautions.push("강한 비가 예상되어 실외 이동 시간을 줄이고 실내 대기 장소를 확인하세요.");
  }

  if (riskTypes.includes("SNOW")) {
    cautions.push("눈 예보가 있어 경사로와 보도 상태를 방문 전 확인하세요.");
  }

  if (riskTypes.includes("ICY_ROAD")) {
    cautions.push("결빙 가능성이 있어 휠체어와 보행 보조기 이동 경로를 보수적으로 선택하세요.");
  }

  if (riskTypes.includes("HEAT")) {
    cautions.push("폭염 수준의 기온이 예상되어 그늘, 냉방 공간, 휴식 시간을 미리 확보하세요.");
  }

  if (riskTypes.includes("COLD")) {
    cautions.push("한파 수준의 기온이 예상되어 방한 준비와 실내 대기 장소를 확인하세요.");
  }

  if (travelerType === "POWER_WHEELCHAIR" && hasAnyPrecipitationRisk(riskTypes)) {
    cautions.push("전동휠체어 이용 시 우천에 대비해 배터리와 방수 상태를 확인하세요.");
  }

  return cautions;
}

/** 위험 유형 조합을 LOW/CAUTION/HIGH 중 하나로 축약한다. */
function calculateRiskLevel(riskTypes: WeatherRiskType[]): WeatherRiskAssessment["riskLevel"] {
  if (
    riskTypes.some(
      (riskType) =>
        riskType === "HEAVY_RAIN" ||
        riskType === "SNOW" ||
        riskType === "ICY_ROAD" ||
        riskType === "HEAT" ||
        riskType === "COLD",
    )
  ) {
    return "HIGH";
  }

  return riskTypes.length > 0 ? "CAUTION" : "LOW";
}

/** 강수 계열 위험이 하나라도 포함되어 있는지 확인한다. */
function hasAnyPrecipitationRisk(riskTypes: WeatherRiskType[]): boolean {
  return riskTypes.some(
    (riskType) => riskType === "RAIN" || riskType === "HEAVY_RAIN" || riskType === "SNOW",
  );
}

/** 위험 유형 배열을 항상 같은 순서로 반환해 MCP 응답을 안정화한다. */
function sortWeatherRiskTypes(riskTypes: Set<WeatherRiskType>): WeatherRiskType[] {
  return Array.from(riskTypes).sort(
    (left, right) => weatherRiskTypeOrder[left] - weatherRiskTypeOrder[right],
  );
}

const rainProbabilityCautionPercent = 60;
const heavyRainAmountMm = 30;
const heatWaveTemperatureCelsius = 33;
const coldWaveTemperatureCelsius = -12;
const icyRoadTemperatureCelsius = 0;

const weatherRiskTypeOrder: Record<WeatherRiskType, number> = {
  RAIN: 0,
  HEAVY_RAIN: 1,
  SNOW: 2,
  ICY_ROAD: 3,
  HEAT: 4,
  COLD: 5,
};

/** WeatherRiskAssessment 생성 시 생략 가능한 필드의 기본값을 보완한다. */
function createRiskAssessment(input: {
  riskLevel?: WeatherRiskAssessment["riskLevel"];
  riskTypes?: WeatherRiskType[];
  cautions: string[];
}): WeatherRiskAssessment {
  return {
    riskLevel: input.riskLevel ?? "LOW",
    riskTypes: input.riskTypes ?? [],
    cautions: input.cautions,
  };
}
