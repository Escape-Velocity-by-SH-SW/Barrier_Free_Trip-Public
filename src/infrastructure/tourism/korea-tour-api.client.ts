import { HttpRequestError } from "../http/http-error.js";
import type { HttpClient } from "../http/http-client.js";
import type { HttpQueryParams } from "../http/url.js";
import type { SearchKeywordResponseDto } from "./korea-tour-api.dto.js";

export interface KoreaTourApiClientOptions {
  serviceKey: string;
  mobileOs: string;
  mobileApp: string;
  defaultPageNo?: number;
  defaultNumOfRows?: number;
}

export interface SearchKeywordRequest {
  keyword: string;
  areaCode?: string;
  sigunguCode?: string;
  cat1?: string;
  cat2?: string;
  cat3?: string;
  arrange?: string;
  pageNo?: number;
  numOfRows?: number;
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

  async searchKeyword(request: SearchKeywordRequest): Promise<SearchKeywordResponseDto> {
    const response = await this.httpClient.requestJson<unknown>({
      path: "/searchKeyword2",
      query: this.createSearchKeywordQuery(request),
    });

    return parseSearchKeywordResponse(response);
  }

  private createSearchKeywordQuery(request: SearchKeywordRequest): HttpQueryParams {
    return {
      serviceKey: this.serviceKey,
      MobileOS: this.mobileOs,
      MobileApp: this.mobileApp,
      _type: "json",
      pageNo: request.pageNo ?? this.defaultPageNo,
      numOfRows: request.numOfRows ?? this.defaultNumOfRows,
      keyword: request.keyword,
      areaCode: request.areaCode,
      sigunguCode: request.sigunguCode,
      cat1: request.cat1,
      cat2: request.cat2,
      cat3: request.cat3,
      arrange: request.arrange,
    };
  }
}

function parseSearchKeywordResponse(response: unknown): SearchKeywordResponseDto {
  if (!isRecord(response)) {
    throw new HttpRequestError({
      kind: "INVALID_RESPONSE",
      message: "Tour API response body was not a JSON object.",
    });
  }

  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
