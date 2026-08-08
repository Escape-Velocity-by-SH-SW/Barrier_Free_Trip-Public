import type { HttpClient, HttpRequestOptions } from "../http/http-client.js";
import { HttpRequestError } from "../http/http-error.js";
import type { OperationContext } from "../../application/ports/operation-context.js";
import type {
  WheelchairChargerBodyDto,
  WheelchairChargerItemDto,
} from "./wheelchair-charger.dto.js";

export interface WheelChairApiClientConfig {
  endpointUrl: string;
  serviceKey: string;
  type?: string;
  timeoutMs?: number;
}

export interface WheelChairChargerRequest {
  pageNo?: number;
  numOfRows?: number;
  ctprvnNm: string;
  signguNm: string;
  signal?: AbortSignal;
  context?: OperationContext;
}

export type WheelchairChargerApiResultCode =
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

type WheelchairChargerApiErrorCode = Exclude<WheelchairChargerApiResultCode, "00" | "03">;

export interface WheelchairChargerApiErrorDetails {
  resultCode: string;
  resultMsg?: string;
  userMessage: string;
}

export class WheelchairChargerApiError extends Error {
  readonly resultCode: string;
  readonly resultMsg?: string;
  readonly userMessage: string;

  constructor(details: WheelchairChargerApiErrorDetails) {
    super(`Wheelchair charger API returned a non-success result code: ${details.resultCode}.`);
    this.name = "WheelchairChargerApiError";
    this.resultCode = details.resultCode;
    this.userMessage = details.userMessage;

    if (details.resultMsg !== undefined) {
      this.resultMsg = details.resultMsg;
    }
  }
}

export class WheelChairChargerApiClient {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly config: WheelChairApiClientConfig,
  ) {}

  async getWheelChairCharger(request: WheelChairChargerRequest): Promise<WheelchairChargerBodyDto> {
    const response = await this.httpClient.requestJson<unknown>(
      buildWheelChairChargerRequestOptions(this.config, request),
    );

    return parseWheelchairChargerResponse(response);
  }
}

function buildWheelChairChargerRequestOptions(
  config: WheelChairApiClientConfig,
  request: WheelChairChargerRequest,
): HttpRequestOptions {
  return {
    path: config.endpointUrl,
    query: {
      serviceKey: config.serviceKey,
      pageNo: request.pageNo ?? 1,
      numOfRows: request.numOfRows ?? 1000,
      type: config.type ?? "json",
      ctprvnNm: request.ctprvnNm,
      signguNm: request.signguNm,
    },
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(request.signal !== undefined ? { signal: request.signal } : {}),
    ...(request.context !== undefined ? { context: request.context } : {}),
  };
}

const successResultCode = "00";
const noDataResultCode = "03";

const apiErrorMessages: Readonly<Record<WheelchairChargerApiErrorCode, string>> = {
  "01": "충전소 API 애플리케이션 오류가 발생했습니다.",
  "02": "충전소 API 데이터베이스 오류가 발생했습니다.",
  "04": "충전소 API HTTP 오류가 발생했습니다.",
  "05": "충전소 API 서비스 연결에 실패했습니다.",
  "10": "충전소 API 요청 파라미터가 올바르지 않습니다.",
  "11": "충전소 API 필수 요청 파라미터가 누락되었습니다.",
  "12": "충전소 API 서비스가 없거나 폐기되었습니다.",
  "20": "충전소 API 서비스 접근이 거부되었습니다.",
  "21": "충전소 API 서비스 키를 일시적으로 사용할 수 없습니다.",
  "22": "충전소 API 서비스 요청 제한 횟수를 초과했습니다.",
  "30": "충전소 API 서비스 키가 등록되어 있지 않습니다.",
  "31": "충전소 API 서비스 키 기한이 만료되었습니다.",
  "32": "충전소 API에 등록되지 않은 IP입니다.",
  "33": "충전소 API 호출이 서명되지 않았습니다.",
  "99": "충전소 API에서 알 수 없는 오류가 발생했습니다.",
};

function parseWheelchairChargerResponse(response: unknown): WheelchairChargerBodyDto {
  if (!isRecord(response)) {
    throw new HttpRequestError({
      kind: "INVALID_RESPONSE",
      message: "Wheelchair charger API response body was not a JSON object.",
    });
  }

  const resultCode = getResultCode(response);

  if (resultCode === noDataResultCode) {
    return getResponseBody(response) ?? createEmptyBody();
  }

  if (resultCode !== undefined && resultCode !== successResultCode) {
    throw createApiError(resultCode, getResultMessage(response));
  }

  const body = getResponseBody(response);

  if (body === undefined) {
    throw new HttpRequestError({
      kind: "INVALID_RESPONSE",
      message: "Wheelchair charger API response body was missing or invalid.",
    });
  }

  return body;
}

function createApiError(
  resultCode: string,
  resultMsg: string | undefined,
): WheelchairChargerApiError {
  return new WheelchairChargerApiError({
    resultCode,
    ...(resultMsg !== undefined ? { resultMsg } : {}),
    userMessage: getApiErrorUserMessage(resultCode),
  });
}

function getApiErrorUserMessage(resultCode: string): string {
  if (isKnownErrorCode(resultCode)) {
    return apiErrorMessages[resultCode];
  }

  return apiErrorMessages["99"];
}

function isKnownErrorCode(value: string): value is WheelchairChargerApiErrorCode {
  return Object.hasOwn(apiErrorMessages, value);
}

function createEmptyBody(): WheelchairChargerBodyDto {
  return {
    items: [],
    totalCount: "0",
    numOfRows: "0",
    pageNo: "1",
  };
}

function getResultCode(response: Record<string, unknown>): string | undefined {
  const resultCode = getHeader(response)?.resultCode;

  if (typeof resultCode === "string") {
    const normalizedCode = resultCode.trim();

    if (normalizedCode.length == 0) {
      return undefined;
    }

    return /^\d+$/.test(normalizedCode) ? normalizedCode.padStart(2, "0") : normalizedCode;
  }

  if (typeof resultCode === "number" && Number.isFinite(resultCode)) {
    return String(resultCode).padStart(2, "0");
  }

  return undefined;
}

function getResultMessage(response: Record<string, unknown>): string | undefined {
  const resultMsg = getHeader(response)?.resultMsg;

  if (typeof resultMsg !== "string") {
    return undefined;
  }

  const normalizedMessage = resultMsg.trim();
  return normalizedMessage.length > 0 ? normalizedMessage : undefined;
}

function getHeader(response: Record<string, unknown>): Record<string, unknown> | undefined {
  const responseBody = response.response;

  if (isRecord(responseBody) && isRecord(responseBody.header)) {
    return responseBody.header;
  }

  const header = response.header;
  return isRecord(header) ? header : undefined;
}

function getResponseBody(response: Record<string, unknown>): WheelchairChargerBodyDto | undefined {
  const responseEnvelope = response.response;
  const body =
    isRecord(responseEnvelope) && isRecord(responseEnvelope.body)
      ? responseEnvelope.body
      : response.body;

  if (!isRecord(body)) {
    return undefined;
  }
  const items = normalizeItems(body.items);

  if (items === undefined) {
    return undefined;
  }

  return {
    items,
    totalCount: normalizeBodyText(body.totalCount) ?? "0",
    numOfRows: normalizeBodyText(body.numOfRows) ?? "0",
    pageNo: normalizeBodyText(body.pageNo) ?? "1",
  };
}

function normalizeItems(value: unknown): WheelchairChargerItemDto[] | undefined {
  if (Array.isArray(value)) {
    return value.map((item) => (isRecord(item) ? item : {}));
  }

  if (!isRecord(value)) {
    return undefined;
  }

  const nestedItems = value.item;

  if (Array.isArray(nestedItems)) {
    return nestedItems.map((item) => (isRecord(item) ? item : {}));
  }

  return isRecord(nestedItems) ? [nestedItems] : undefined;
}

function normalizeBodyText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
