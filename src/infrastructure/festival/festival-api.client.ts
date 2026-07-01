import { HttpRequestError } from "../http/http-error.js";
import type { HttpClient } from "../http/http-client.js";
import type { HttpQueryParams } from "../http/url.js";
import type { FestivalResponseDto } from "./festival.dto.js";

export interface FestivalApiClientOptions {
  path: string;
  serviceKey?: string;
  defaultPage?: number;
  defaultPerPage?: number;
}

export interface FestivalApiRequest {
  page?: number;
  perPage?: number;
}

export class FestivalApiClient {
  private readonly path: string;
  private readonly serviceKey: string | undefined;
  private readonly defaultPage: number;
  private readonly defaultPerPage: number;

  constructor(
    private readonly httpClient: HttpClient,
    options: FestivalApiClientOptions,
  ) {
    this.path = options.path;
    this.serviceKey = options.serviceKey;
    this.defaultPage = options.defaultPage ?? 1;
    this.defaultPerPage = options.defaultPerPage ?? 1000;
  }

  async getFestivals(request: FestivalApiRequest = {}): Promise<FestivalResponseDto> {
    const response = await this.httpClient.requestJson<unknown>({
      path: this.path,
      query: this.createQuery(request),
    });

    return parseFestivalResponse(response);
  }

  private createQuery(request: FestivalApiRequest): HttpQueryParams {
    return {
      serviceKey: this.serviceKey,
      page: request.page ?? this.defaultPage,
      perPage: request.perPage ?? this.defaultPerPage,
      returnType: "JSON",
    };
  }
}

function parseFestivalResponse(response: unknown): FestivalResponseDto {
  if (!isRecord(response) || !Array.isArray(response.data)) {
    throw new HttpRequestError({
      kind: "INVALID_RESPONSE",
      message: "Festival API response body did not match the expected shape.",
    });
  }

  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
