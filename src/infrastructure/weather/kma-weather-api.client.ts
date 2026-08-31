import type { HttpClient, HttpRequestOptions } from "../http/http-client.js";
import { HttpRequestError } from "../http/http-error.js";
import type { OperationContext } from "../../application/ports/operation-context.js";
import type { KmaForecastItemDto, KmaForecastResponseDto } from "./kma-weather.dto.js";

/** KMA 단기예보 API 호출에 필요한 고정 설정을 담는다. */
export interface KmaWeatherApiClientConfig {
  endpointUrl: string;
  serviceKey: string;
  dataType?: string;
}

/** KMA 단기예보 조회 시점과 격자 좌표를 표현하는 요청 값이다. */
export interface KmaForecastRequest {
  baseDate: string;
  baseTime: string;
  visitDate?: string;
  nx: number;
  ny: number;
  numOfRows?: number;
  signal?: AbortSignal;
  context?: OperationContext;
}

type KmaForecastPageRequest = KmaForecastRequest & {
  pageNo: number;
  numOfRows: number;
};

/** KMA 공공데이터 포털이 응답 header.resultCode로 내려주는 결과 코드 목록이다. */
export type KmaWeatherApiResultCode =
  | "00"
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "10"
  | "11"
  | "12"
  | "20"
  | "21"
  | "22"
  | "30"
  | "31"
  | "32"
  | "33"
  | "99";

type KmaWeatherApiErrorCode = Exclude<KmaWeatherApiResultCode, "00" | "03">;

/** API 고유 오류를 MCP 응답에서 안전하게 다루기 위한 정규화된 오류 상세 정보다. */
export interface KmaWeatherApiErrorDetails {
  resultCode: string;
  resultMsg?: string;
  userMessage: string;
}

/** KMA 응답에는 성공했지만 요청한 조회일자 예보 item이 없을 때 던지는 오류다. */
export class KmaForecastDateNotFoundError extends Error {
  readonly visitDate: string;

  constructor(visitDate: string) {
    super(`KMA forecast API response did not include forecast items for visit date: ${visitDate}.`);
    this.name = "KmaForecastDateNotFoundError";
    this.visitDate = visitDate;
  }
}

/** KMA resultCode가 정상이나 데이터 없음이 아닐 때 던지는 API 고유 오류다. */
export class KmaWeatherApiError extends Error {
  readonly resultCode: string;
  readonly resultMsg?: string;
  readonly userMessage: string;

  constructor(details: KmaWeatherApiErrorDetails) {
    super(`KMA forecast API returned a non-success result code: ${details.resultCode}.`);
    this.name = "KmaWeatherApiError";
    this.resultCode = details.resultCode;
    this.userMessage = details.userMessage;

    if (details.resultMsg !== undefined) {
      this.resultMsg = details.resultMsg;
    }
  }
}

export class KmaWeatherApiClient {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly config: KmaWeatherApiClientConfig,
  ) {}

  /** 단기예보 endpoint를 호출하고 KMA envelope/resultCode만 최소 검증해 DTO로 반환한다. */
  async getForecast(request: KmaForecastRequest): Promise<KmaForecastResponseDto> {
    const response = await this.getAllForecastPages(request);

    return filterForecastResponse(response, request.visitDate);
  }

  /** totalCount를 만족할 때까지 단기예보 페이지를 순차 조회해 하나의 DTO로 합친다. */
  private async getAllForecastPages(request: KmaForecastRequest): Promise<KmaForecastResponseDto> {
    const numOfRows = request.numOfRows ?? defaultNumOfRows;
    let pageNo = defaultPageNo;
    let firstResponse: KmaForecastResponseDto | undefined;
    let totalCount: number | undefined;
    const items: KmaForecastItemDto[] = [];

    do {
      const response = await this.getForecastPage({
        ...request,
        pageNo,
        numOfRows,
      });
      firstResponse ??= response;

      const pageItems = getForecastItems(response);
      items.push(...pageItems);
      totalCount ??= response.response.body?.totalCount ?? items.length;

      if (pageItems.length === 0) {
        break;
      }

      pageNo += 1;
    } while (totalCount !== undefined && items.length < totalCount);

    if (firstResponse === undefined) {
      throw new HttpRequestError({
        kind: "INVALID_RESPONSE",
        message: "KMA forecast API response was not collected.",
      });
    }

    return replaceForecastItems(firstResponse, items, totalCount ?? items.length);
  }

  /** 단일 페이지를 호출한 뒤 KMA header/resultCode 검증을 적용한다. */
  private async getForecastPage(request: KmaForecastPageRequest): Promise<KmaForecastResponseDto> {
    const response = await this.httpClient.requestJson<unknown>(
      buildForecastRequestOptions(this.config, request),
    );

    return parseKmaForecastResponse(response);
  }
}

/** 공통 HttpClient가 이해할 수 있는 path/query/timeout/signal 옵션으로 변환한다. */
function buildForecastRequestOptions(
  config: KmaWeatherApiClientConfig,
  request: KmaForecastPageRequest,
): HttpRequestOptions {
  return {
    path: config.endpointUrl,
    query: {
      serviceKey: config.serviceKey,
      pageNo: request.pageNo,
      numOfRows: request.numOfRows,
      dataType: config.dataType ?? "JSON",
      base_date: request.baseDate,
      base_time: request.baseTime,
      nx: request.nx,
      ny: request.ny,
    },
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(request.context !== undefined ? { context: request.context } : {}),
  };
}

const successResultCode = "00";
const noDataResultCode = "03";
const defaultPageNo = 1;
const defaultNumOfRows = 1500;
const forecastCategories = new Set(["POP", "PCP", "PTY", "TMN", "TMX"]);

/** KMA 오류 코드를 사용자에게 노출 가능한 한국어 메시지로 변환하기 위한 표다. */
const apiErrorMessages: Readonly<Record<KmaWeatherApiErrorCode, string>> = {
  "01": "기상청 단기예보 API 애플리케이션 오류가 발생했습니다.",
  "02": "기상청 단기예보 API 데이터베이스 오류가 발생했습니다.",
  "04": "기상청 단기예보 API HTTP 오류가 발생했습니다.",
  "05": "기상청 단기예보 API 서비스 연결에 실패했습니다.",
  "10": "기상청 단기예보 API 요청 파라미터가 올바르지 않습니다.",
  "11": "기상청 단기예보 API 필수 요청 파라미터가 누락되었습니다.",
  "12": "기상청 단기예보 API 서비스가 없거나 폐기되었습니다.",
  "20": "기상청 단기예보 API 서비스 접근이 거부되었습니다.",
  "21": "기상청 단기예보 API 서비스 키를 일시적으로 사용할 수 없습니다.",
  "22": "기상청 단기예보 API 서비스 요청 제한 횟수를 초과했습니다.",
  "30": "기상청 단기예보 API 서비스 키가 등록되어 있지 않습니다.",
  "31": "기상청 단기예보 API 서비스 키 기한이 만료되었습니다.",
  "32": "기상청 단기예보 API에 등록되지 않은 IP입니다.",
  "33": "기상청 단기예보 API 호출이 서명되지 않았습니다.",
  "99": "기상청 단기예보 API에서 알 수 없는 오류가 발생했습니다.",
};

/** 응답 envelope를 확인하고 KMA resultCode를 성공, 데이터 없음, API 오류로 분류한다. */
function parseKmaForecastResponse(response: unknown): KmaForecastResponseDto {
  if (!isRecord(response)) {
    throw new HttpRequestError({
      kind: "INVALID_RESPONSE",
      message: "KMA forecast API response body was not a JSON object.",
    });
  }

  const responseEnvelope = response.response;

  if (!isRecord(responseEnvelope) || !isRecord(responseEnvelope.header)) {
    throw new HttpRequestError({
      kind: "INVALID_RESPONSE",
      message: "KMA forecast API response envelope was missing or invalid.",
    });
  }

  const resultCode = responseEnvelope.header.resultCode;

  if (typeof resultCode !== "string" || resultCode.trim().length === 0) {
    throw new HttpRequestError({
      kind: "INVALID_RESPONSE",
      message: "KMA forecast API response resultCode was missing or invalid.",
    });
  }

  if (resultCode !== successResultCode) {
    if (resultCode === noDataResultCode) {
      return response as unknown as KmaForecastResponseDto;
    }

    throw createApiError(resultCode, getResultMessage(responseEnvelope.header));
  }

  return response as unknown as KmaForecastResponseDto;
}

function filterForecastResponse(
  response: KmaForecastResponseDto,
  visitDate: string | undefined,
): KmaForecastResponseDto {
  if (visitDate === undefined) {
    return response;
  }

  const normalizedVisitDate = normalizeVisitDate(visitDate);
  const filteredItems = getForecastItems(response).filter(
    (item) => item.fcstDate === normalizedVisitDate && forecastCategories.has(item.category),
  );

  if (filteredItems.length === 0) {
    throw new KmaForecastDateNotFoundError(visitDate);
  }

  return replaceForecastItems(response, filteredItems, filteredItems.length);
}

/** 원본 envelope는 유지하고 body.items/page 정보를 누적 또는 필터링 결과로 교체한다. */
function replaceForecastItems(
  response: KmaForecastResponseDto,
  items: KmaForecastItemDto[],
  totalCount: number,
): KmaForecastResponseDto {
  const body = response.response.body;

  if (body === undefined) {
    return response;
  }

  return {
    response: {
      header: response.response.header,
      body: {
        ...body,
        items: {
          item: items,
        },
        pageNo: defaultPageNo,
        numOfRows: items.length,
        totalCount,
      },
    },
  };
}

/** KMA body.items.item 배열을 안전하게 꺼내고, 누락 시 빈 배열로 취급한다. */
function getForecastItems(response: KmaForecastResponseDto): KmaForecastItemDto[] {
  return response.response.body?.items?.item ?? [];
}

/** MCP 입력의 YYYY-MM-DD 조회일자를 KMA fcstDate 형식인 YYYYMMDD로 변환한다. */
function normalizeVisitDate(visitDate: string): string {
  return visitDate.replaceAll("-", "");
}

/** KMA resultCode/resultMsg를 MCP 서버에서 다루기 쉬운 typed error로 감싼다. */
function createApiError(resultCode: string, resultMsg: string | undefined): KmaWeatherApiError {
  return new KmaWeatherApiError({
    resultCode,
    ...(resultMsg !== undefined ? { resultMsg } : {}),
    userMessage: getApiErrorUserMessage(resultCode),
  });
}

/** 알려진 KMA 오류 코드는 전용 메시지로, 모르는 코드는 UNKNOWN 메시지로 변환한다. */
function getApiErrorUserMessage(resultCode: string): string {
  if (isKnownErrorCode(resultCode)) {
    return apiErrorMessages[resultCode];
  }

  return apiErrorMessages["99"];
}

/** 문자열 resultCode가 KMA 오류 메시지 표에 있는 코드인지 좁힌다. */
function isKnownErrorCode(value: string): value is KmaWeatherApiErrorCode {
  return Object.hasOwn(apiErrorMessages, value);
}

/** 공공데이터 응답의 resultMsg를 빈 문자열 없이 정규화한다. */
function getResultMessage(header: Record<string, unknown>): string | undefined {
  const resultMsg = header.resultMsg;

  if (typeof resultMsg !== "string") {
    return undefined;
  }

  const normalizedMessage = resultMsg.trim();
  return normalizedMessage.length > 0 ? normalizedMessage : undefined;
}

/** unknown 응답 값을 객체처럼 안전하게 다루기 위한 타입 가드다. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
