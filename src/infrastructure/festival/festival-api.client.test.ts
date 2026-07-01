import { describe, expect, it } from "vitest";

import type { HttpClient, HttpRequestOptions } from "../http/http-client.js";
import type { FestivalResponseDto } from "./festival.dto.js";
import { FestivalApiClient } from "./festival-api.client.js";

class CapturingHttpClient implements HttpClient {
  private readonly requests: HttpRequestOptions[] = [];

  constructor(private readonly response: unknown) {}

  requestJson<TResponse = unknown>(options: HttpRequestOptions): Promise<TResponse> {
    this.requests.push(options);
    return Promise.resolve(this.response as TResponse);
  }

  get lastRequest(): HttpRequestOptions {
    const request = this.requests.at(-1);

    if (request === undefined) {
      throw new Error("HTTP client was not called.");
    }

    return request;
  }
}

describe("FestivalApiClient", () => {
  it("calls the configured standard data endpoint with paging query parameters", async () => {
    const response: FestivalResponseDto = {
      currentCount: 0,
      data: [],
      matchCount: 0,
      page: 1,
      perPage: 100,
      totalCount: 0,
    };
    const httpClient = new CapturingHttpClient(response);
    const client = new FestivalApiClient(httpClient, {
      path: "/festival",
      serviceKey: "test-service-key",
      defaultPage: 1,
      defaultPerPage: 100,
    });

    await expect(client.getFestivals({ page: 2, perPage: 50 })).resolves.toBe(response);

    expect(httpClient.lastRequest).toMatchObject({
      path: "/festival",
      query: {
        serviceKey: "test-service-key",
        page: 2,
        perPage: 50,
        returnType: "JSON",
      },
    });
  });

  it("rejects non-object JSON responses as invalid API responses", async () => {
    const httpClient = new CapturingHttpClient(null);
    const client = new FestivalApiClient(httpClient, {
      path: "/festival",
      serviceKey: "test-service-key",
    });

    await expect(client.getFestivals()).rejects.toMatchObject({
      kind: "INVALID_RESPONSE",
    });
  });

  it("rejects responses with non-array data as invalid API responses", async () => {
    const httpClient = new CapturingHttpClient({
      currentCount: 1,
      data: {},
      matchCount: 1,
      page: 1,
      perPage: 100,
      totalCount: 1,
    });
    const client = new FestivalApiClient(httpClient, {
      path: "/festival",
      serviceKey: "test-service-key",
    });

    await expect(client.getFestivals()).rejects.toMatchObject({
      kind: "INVALID_RESPONSE",
    });
  });
});
