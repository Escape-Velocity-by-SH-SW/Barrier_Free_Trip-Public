// import type { WeatherRepository } from "../ports/weather.repository.js";
// import type { TravelerType } from "../../domain/accessibility.js";
// import type { Destination } from "../../domain/destination.js";
// import type { DestinationWeatherResult, HourlyForecast } from "../../domain/weather.js";

// export interface GetDestinationWeatherRequest {
//   destination: Destination;
//   visitDate: string;
//   travelerType?: TravelerType;
// }

// interface CreateWeatherResultInput extends GetDestinationWeatherRequest {
//   status: DestinationWeatherResult["status"];
//   forecasts: HourlyForecast[];
//   cautions: string[];
// }

// export class WeatherService {
//   constructor(private readonly weatherRepository: WeatherRepository) {}

//   async getDestinationWeather(
//     request: GetDestinationWeatherRequest,
//   ): Promise<DestinationWeatherResult> {
//     try {
//       const sourceData = await this.weatherRepository.getForecast({
//         coordinates: request.destination.coordinates,
//         visitDate: request.visitDate,
//       });

//       if (sourceData.forecasts.length === 0) {
//         return createWeatherResult({
//           ...request,
//           status: "NO_DATA",
//           forecasts: [],
//           cautions: ["해당 방문일에 제공 가능한 단기예보 데이터가 없습니다."],
//         });
//       }

//       return createWeatherResult({
//         ...request,
//         status: "AVAILABLE",
//         forecasts: sourceData.forecasts,
//         cautions: buildWeatherCautions(sourceData.forecasts, request.travelerType),
//       });
//     } catch {
//       return createWeatherResult({
//         ...request,
//         status: "FAILED",
//         forecasts: [],
//         cautions: ["날씨 정보를 조회하지 못했습니다. 방문 전 공식 예보를 확인하세요."],
//       });
//     }
//   }
// }

// function createWeatherResult(input: CreateWeatherResultInput): DestinationWeatherResult {
//   const result = {
//     status: input.status,
//     destination: input.destination,
//     visitDate: input.visitDate,
//     forecasts: input.forecasts,
//     cautions: input.cautions,
//   };

//   if (input.travelerType === undefined) {
//     return result;
//   }

//   return {
//     ...result,
//     travelerType: input.travelerType,
//   };
// }

// function buildWeatherCautions(
//   forecasts: HourlyForecast[],
//   travelerType?: TravelerType,
// ): string[] {
//   const cautions: string[] = [];

//   if (forecasts.some((forecast) => hasPrecipitationRisk(forecast))) {
//     cautions.push("강수 가능성이 있어 미끄럼과 우천 이동 동선을 확인하세요.");
//   }

//   if (forecasts.some((forecast) => hasWindRisk(forecast))) {
//     cautions.push("바람이 강할 수 있어 야외 이동 보조기기 사용 시 주의하세요.");
//   }

//   if (travelerType === "POWER_WHEELCHAIR") {
//     cautions.push("전동휠체어 이용 시 우천에 대비해 배터리와 방수 상태를 확인하세요.");
//   }

//   return cautions;
// }

// function hasPrecipitationRisk(forecast: HourlyForecast): boolean {
//   return (
//     forecast.precipitationType !== undefined &&
//     forecast.precipitationType !== "NONE" &&
//     forecast.precipitationType !== "UNKNOWN"
//   );
// }

// function hasWindRisk(forecast: HourlyForecast): boolean {
//   return forecast.windSpeedMps !== undefined && forecast.windSpeedMps >= 8;
// }
