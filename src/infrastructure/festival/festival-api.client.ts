import { HttpRequestError } from "../http/http-error.js";
import type { HttpClient } from "../http/http-client.js";
import type { HttpQueryParams } from "../http/url.js";
import type { FestivalResponseDto, FestivalRowDto } from "./festival.dto.js";
import type { OperationContext } from "../../application/ports/operation-context.js";

export interface FestivalApiClientOptions {
  path: string;
  serviceKey?: string;
  defaultPage?: number;
  defaultPerPage?: number;
  fullScanPageSize?: number;
}

export interface FestivalApiRequest {
  page?: number;
  perPage?: number;
  venue?: string;
  roadAddress?: string;
  context?: OperationContext;
}

const fullScanConcurrency = 4;

export class FestivalApiClient {
  private readonly path: string;
  private readonly serviceKey: string | undefined;
  private readonly defaultPage: number;
  private readonly defaultPerPage: number;
  private readonly fullScanPageSize: number;

  constructor(
    private readonly httpClient: HttpClient,
    options: FestivalApiClientOptions,
  ) {
    this.path = options.path;
    this.serviceKey = options.serviceKey;
    this.defaultPage = options.defaultPage ?? 1;
    this.defaultPerPage = options.defaultPerPage ?? 1000;
    this.fullScanPageSize = options.fullScanPageSize ?? options.defaultPerPage ?? 1_000;
  }

  async getFestivals(request: FestivalApiRequest = {}): Promise<FestivalResponseDto> {
    const response = await this.httpClient.requestJson<unknown>({
      path: this.path,
      query: this.createQuery(request),
      ...(request.context !== undefined ? { context: request.context } : {}),
    });

    return parseFestivalResponse(response);
  }

  async getAllFestivals(context?: OperationContext): Promise<FestivalResponseDto> {
    const firstPage = await this.getFestivals({
      page: 1,
      perPage: this.fullScanPageSize,
      ...(context !== undefined ? { context } : {}),
    });
    const totalCount = normalizeCount(firstPage.totalCount);
    const pageCount = Math.ceil(totalCount / this.fullScanPageSize);

    if (pageCount <= 1) {
      return firstPage;
    }

    const remainingPages = await mapWithConcurrency(
      Array.from({ length: pageCount - 1 }, (_, index) => index + 2),
      fullScanConcurrency,
      (page) =>
        this.getFestivals({
          page,
          perPage: this.fullScanPageSize,
          ...(context !== undefined ? { context } : {}),
        }),
    );

    return {
      ...firstPage,
      data: [firstPage, ...remainingPages].flatMap((response) => response.data ?? []),
      totalCount,
    };
  }

  private createQuery(request: FestivalApiRequest): HttpQueryParams {
    return {
      serviceKey: this.serviceKey,
      pageNo: request.page ?? this.defaultPage,
      numOfRows: request.perPage ?? this.defaultPerPage,
      type: "json",
      opar: request.venue,
      rdnmadr: request.roadAddress,
    };
  }
}

function parseFestivalResponse(response: unknown): FestivalResponseDto {
  if (!isRecord(response)) {
    throw new HttpRequestError({
      kind: "INVALID_RESPONSE",
      message: "Festival API response body did not match the expected shape.",
    });
  }

  const resultCode = getResultCode(response);

  if (resultCode === "03") {
    return {
      ...response,
      data: [],
    };
  }

  if (resultCode !== undefined && resultCode !== "00") {
    throw new HttpRequestError({
      kind: "UNKNOWN",
      message: `Festival API returned a non-success result code: ${resultCode}.`,
      cause: {
        resultCode,
        resultMsg: getResultMessage(response),
      },
    });
  }

  const data = normalizeFestivalRows(response);

  if (data === undefined) {
    throw new HttpRequestError({
      kind: "INVALID_RESPONSE",
      message: "Festival API response body did not include festival rows.",
    });
  }

  return {
    ...response,
    data,
    ...getPagination(response),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeFestivalRows(response: Record<string, unknown>): FestivalRowDto[] | undefined {
  if (Array.isArray(response.data)) {
    return response.data.map(toFestivalRow);
  }

  const body = getBody(response);
  const items = body?.items;

  if (items === undefined || items === null || items === "") {
    return [];
  }

  if (Array.isArray(items)) {
    return items.map(toFestivalRow);
  }

  if (isRecord(items)) {
    const item = items.item;

    if (item === undefined || item === null || item === "") {
      return [];
    }

    if (Array.isArray(item)) {
      return item.map(toFestivalRow);
    }

    return [toFestivalRow(item)];
  }

  return undefined;
}

function toFestivalRow(value: unknown): FestivalRowDto {
  return isRecord(value) ? value : {};
}

function getResultCode(response: Record<string, unknown>): string | undefined {
  const resultCode = getHeader(response)?.resultCode;

  if (typeof resultCode === "string") {
    const normalizedCode = resultCode.trim();
    return normalizedCode.length > 0 ? normalizedCode.padStart(2, "0") : undefined;
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
  const envelope = response.response;

  if (isRecord(envelope) && isRecord(envelope.header)) {
    return envelope.header;
  }

  const header = response.header;
  return isRecord(header) ? header : undefined;
}

function getBody(response: Record<string, unknown>): Record<string, unknown> | undefined {
  const envelope = response.response;

  if (isRecord(envelope) && isRecord(envelope.body)) {
    return envelope.body;
  }

  const body = response.body;
  return isRecord(body) ? body : undefined;
}

function getPagination(response: Record<string, unknown>): Partial<FestivalResponseDto> {
  const body = getBody(response);

  if (body === undefined) {
    return {};
  }

  return {
    ...optionalCountProperty("totalCount", normalizeBodyCount(body.totalCount)),
    ...optionalCountProperty("page", normalizeBodyCount(body.pageNo)),
    ...optionalCountProperty("perPage", normalizeBodyCount(body.numOfRows)),
  };
}

function optionalCountProperty<TKey extends "totalCount" | "page" | "perPage">(
  key: TKey,
  value: string | number | null | undefined,
): Partial<Pick<FestivalResponseDto, TKey>> {
  return value !== undefined ? ({ [key]: value } as Pick<FestivalResponseDto, TKey>) : {};
}

function normalizeBodyCount(value: unknown): string | number | null | undefined {
  if (typeof value === "string" || typeof value === "number" || value === null) {
    return value;
  }

  return undefined;
}

function normalizeCount(value: string | number | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const count = Number(value);
    return Number.isFinite(count) ? count : 0;
  }

  return 0;
}

async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem) => Promise<TResult>,
): Promise<TResult[]> {
  const results: TResult[] = [];

  for (let index = 0; index < items.length; index += concurrency) {
    const batch = items.slice(index, index + concurrency);
    results.push(...(await Promise.all(batch.map(mapper))));
  }

  return results;
}
