import { describe, expect, it } from "vitest";

import type { HttpClient, HttpRequestOptions } from "../http/http-client.js";
import type { SearchKeywordResponseDto } from "./korea-tour-api.dto.js";
import { KoreaTourApiClient } from "./korea-tour-api.client.js";

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

describe("KoreaTourApiClient", () => {
  it("calls searchKeyword2 with common and search query parameters", async () => {
    const response: SearchKeywordResponseDto = {
      response: {
        header: {
          resultCode: "0000",
          resultMsg: "OK",
        },
        body: {
          totalCount: "0",
        },
      },
    };
    const httpClient = new CapturingHttpClient(response);
    const client = new KoreaTourApiClient(httpClient, {
      serviceKey: "test-service-key",
      mobileOs: "ETC",
      mobileApp: "BarrierFreeTrip",
      defaultPageNo: 1,
      defaultNumOfRows: 10,
    });

    await expect(
      client.searchKeyword({
        keyword: "경복궁",
        areaCode: "1",
        arrange: "A",
        pageNo: 2,
        numOfRows: 5,
      }),
    ).resolves.toBe(response);

    expect(httpClient.lastRequest).toMatchObject({
      path: "/searchKeyword2",
      query: {
        serviceKey: "test-service-key",
        MobileOS: "ETC",
        MobileApp: "BarrierFreeTrip",
        _type: "json",
        pageNo: 2,
        numOfRows: 5,
        keyword: "경복궁",
        areaCode: "1",
        arrange: "A",
      },
    });
  });

  it("rejects non-object JSON responses as invalid API responses", async () => {
    const httpClient = new CapturingHttpClient(null);
    const client = new KoreaTourApiClient(httpClient, {
      serviceKey: "test-service-key",
      mobileOs: "ETC",
      mobileApp: "BarrierFreeTrip",
    });

    await expect(client.searchKeyword({ keyword: "경복궁" })).rejects.toMatchObject({
      kind: "INVALID_RESPONSE",
    });
  });

  it("rejects Tour API error envelopes before mapping them as empty results", async () => {
    const httpClient = new CapturingHttpClient({
      response: {
        header: {
          resultCode: "30",
          resultMsg: "SERVICE KEY IS NOT REGISTERED ERROR.",
        },
        body: {
          items: "",
          totalCount: "0",
        },
      },
    });
    const client = new KoreaTourApiClient(httpClient, {
      serviceKey: "test-service-key",
      mobileOs: "ETC",
      mobileApp: "BarrierFreeTrip",
    });

    await expect(client.searchKeyword({ keyword: "경복궁" })).rejects.toMatchObject({
      kind: "UNKNOWN",
      message: "Tour API returned a non-success result code: 30.",
    });
  });
});
