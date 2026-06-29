import type { KmaUltraSrtForecastResponseDto } from "./kma-weather.dto.js";

export interface KmaWeatherApiClientConfig {
  endpointUrl: string;
  serviceKey: string;
  timeoutMs?: number;
}

export interface KmaUltraSrtForecastRequest {
  baseDate: string;
  baseTime: string;
  nx: number;
  ny: number;
  pageNo?: number;
  numOfRows?: number;
}

export type KmaVilageForecastRequest = KmaUltraSrtForecastRequest;

export class KmaWeatherApiError extends Error {
  constructor(
    message: string,
    readonly resultCode?: string,
  ) {
    super(message);
    this.name = "KmaWeatherApiError";
  }
}

export class KmaWeatherApiClient {
  constructor(private readonly config: KmaWeatherApiClientConfig) {}

  async getUltraSrtForecast(
    request: KmaUltraSrtForecastRequest,
  ): Promise<KmaUltraSrtForecastResponseDto> {
    const response = await this.fetchJson(buildUltraSrtForecastUrl(this.config, request));
    const dto = parseKmaUltraSrtForecastResponse(response);
    const { resultCode, resultMsg } = dto.response.header;

    if (resultCode !== "00") {
      throw new KmaWeatherApiError(resultMsg, resultCode);
    }

    return dto;
  }

  async getVilageForecast(
    request: KmaUltraSrtForecastRequest,
  ): Promise<KmaUltraSrtForecastResponseDto> {
    return this.getUltraSrtForecast(request);
  }

  private async fetchJson(url: URL): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 10_000,
    );

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new KmaWeatherApiError(`KMA weather API returned HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new KmaWeatherApiError("KMA weather API request timed out");
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function buildUltraSrtForecastUrl(
  config: KmaWeatherApiClientConfig,
  request: KmaUltraSrtForecastRequest,
): URL {
  const url = new URL(config.endpointUrl);

  url.search = new URLSearchParams({
    serviceKey: config.serviceKey,
    pageNo: String(request.pageNo ?? 1),
    numOfRows: String(request.numOfRows ?? 3),
    dataType: "JSON",
    base_date: request.baseDate,
    base_time: request.baseTime,
    nx: String(request.nx),
    ny: String(request.ny),
  }).toString();

  return url;
}

function parseKmaUltraSrtForecastResponse(value: unknown): KmaUltraSrtForecastResponseDto {
  if (!isKmaUltraSrtForecastResponseDto(value)) {
    throw new KmaWeatherApiError("KMA weather API returned an invalid response");
  }

  return value;
}

function isKmaUltraSrtForecastResponseDto(
  value: unknown,
): value is KmaUltraSrtForecastResponseDto {
  if (!isRecord(value) || !isRecord(value.response)) {
    return false;
  }

  const { header } = value.response;

  return (
    isRecord(header) &&
    typeof header.resultCode === "string" &&
    typeof header.resultMsg === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
