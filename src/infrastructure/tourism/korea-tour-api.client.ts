import { HttpRequestError } from "../http/http-error.js";
import type { HttpClient } from "../http/http-client.js";
import type { HttpQueryParams } from "../http/url.js";
import type { OperationContext } from "../../application/ports/operation-context.js";
import type { DetailWithTourResponseDto, SearchKeywordResponseDto } from "./korea-tour-api.dto.js";

const tourApiSuccessResultCode = "0000";

export interface KoreaTourApiClientOptions {
  serviceKey: string;
  mobileOs: string;
  mobileApp: string;
  defaultPageNo?: number;
  defaultNumOfRows?: number;
}

export interface SearchKeywordRequest {
  keyword: string;
  contentTypeId?: string;
  areaCode?: string;
  sigunguCode?: string;
  cat1?: string;
  cat2?: string;
  cat3?: string;
  arrange?: string;
  pageNo?: number;
  numOfRows?: number;
}

export interface DetailWithTourRequest {
  contentId: string;
}

export class KoreaTourApiClient {
  private readonly serviceKey: string;
  private readonly mobileOs: string;
  private readonly mobileApp: string;
  private readonly defaultPageNo: number;
  private readonly defaultNumOfRows: number;

  constructor(
    private readonly httpClient: HttpClient,
    options: KoreaTourApiClientOptions,
  ) {
    this.serviceKey = options.serviceKey;
    this.mobileOs = options.mobileOs;
    this.mobileApp = options.mobileApp;
    this.defaultPageNo = options.defaultPageNo ?? 1;
    this.defaultNumOfRows = options.defaultNumOfRows ?? 10;
  }

  async searchKeyword(
    request: SearchKeywordRequest,
    context?: OperationContext,
  ): Promise<SearchKeywordResponseDto> {
    const response = await this.httpClient.requestJson<unknown>({
      path: "/searchKeyword2",
      query: this.createSearchKeywordQuery(request),
      source: "tourism",
      ...(context !== undefined ? { context } : {}),
    });

    return parseSearchKeywordResponse(response);
  }

  async getDetailWithTour(
    request: DetailWithTourRequest,
    context?: OperationContext,
  ): Promise<DetailWithTourResponseDto> {
    const response = await this.httpClient.requestJson<unknown>({
      path: "/detailWithTour2",
      query: {
        ...this.createCommonQuery(),
        contentId: request.contentId,
      },
      source: "accessibility",
      ...(context !== undefined ? { context } : {}),
    });

    return parseDetailWithTourResponse(response);
  }

  private createSearchKeywordQuery(request: SearchKeywordRequest): HttpQueryParams {
    return {
      ...this.createCommonQuery(),
      pageNo: request.pageNo ?? this.defaultPageNo,
      numOfRows: request.numOfRows ?? this.defaultNumOfRows,
      keyword: request.keyword,
      contentTypeId: request.contentTypeId,
      areaCode: request.areaCode,
      sigunguCode: request.sigunguCode,
      cat1: request.cat1,
      cat2: request.cat2,
      cat3: request.cat3,
      arrange: request.arrange,
    };
  }

  private createCommonQuery(): HttpQueryParams {
    return {
      serviceKey: this.serviceKey,
      MobileOS: this.mobileOs,
      MobileApp: this.mobileApp,
      _type: "json",
    };
  }
}

function parseSearchKeywordResponse(response: unknown): SearchKeywordResponseDto {
  return validateTourApiResponse(response);
}

function parseDetailWithTourResponse(response: unknown): DetailWithTourResponseDto {
  return validateTourApiResponse(response);
}

function validateTourApiResponse(response: unknown): Record<string, unknown> {
  if (!isRecord(response)) {
    throw new HttpRequestError({
      kind: "INVALID_RESPONSE",
      message: "Tour API response body was not a JSON object.",
    });
  }

  const resultCode = getTourApiResultCode(response);

  if (resultCode !== undefined && resultCode !== tourApiSuccessResultCode) {
    throw new HttpRequestError({
      kind: "UNKNOWN",
      message: `Tour API returned a non-success result code: ${resultCode}.`,
      cause: {
        resultCode,
        resultMsg: getTourApiResultMessage(response),
      },
    });
  }

  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getTourApiResultCode(response: Record<string, unknown>): string | undefined {
  const header = getTourApiHeader(response);
  const resultCode = header?.resultCode;

  if (typeof resultCode === "string") {
    const normalizedCode = resultCode.trim();
    return normalizedCode.length > 0 ? normalizedCode : undefined;
  }

  if (typeof resultCode === "number" && Number.isFinite(resultCode)) {
    return String(resultCode);
  }

  return undefined;
}

function getTourApiResultMessage(response: Record<string, unknown>): string | undefined {
  const header = getTourApiHeader(response);
  const resultMsg = header?.resultMsg;

  if (typeof resultMsg !== "string") {
    return undefined;
  }

  const normalizedMessage = resultMsg.trim();
  return normalizedMessage.length > 0 ? normalizedMessage : undefined;
}

function getTourApiHeader(response: Record<string, unknown>): Record<string, unknown> | undefined {
  const responseBody = response.response;

  if (isRecord(responseBody) && isRecord(responseBody.header)) {
    return responseBody.header;
  }

  const header = response.header;
  return isRecord(header) ? header : undefined;
}
