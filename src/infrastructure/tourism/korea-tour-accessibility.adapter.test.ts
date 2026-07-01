import { describe, expect, it } from "vitest";

import type { HttpClient, HttpRequestOptions } from "../http/http-client.js";
import type { DetailWithTourResponseDto } from "./korea-tour-api.dto.js";
import { KoreaTourAccessibilityAdapter } from "./korea-tour-accessibility.adapter.js";
import { KoreaTourApiClient } from "./korea-tour-api.client.js";

class StaticHttpClient implements HttpClient {
  constructor(private readonly response: unknown) {}

  requestJson<TResponse = unknown>(options: HttpRequestOptions): Promise<TResponse> {
    void options;

    return Promise.resolve(this.response as TResponse);
  }
}

describe("KoreaTourAccessibilityAdapter", () => {
  it("returns accessibility source data from detailWithTour2", async () => {
    const response: DetailWithTourResponseDto = {
      response: {
        body: {
          items: {
            item: {
              parking: "장애인 주차장 있음",
              route: "접근로 설치",
              exit: "주출입구 경사로 있음",
              elevator: "엘리베이터 있음",
              restroom: "장애인 화장실 있음",
              wheelchair: "휠체어 대여 가능",
              stroller: "유모차 대여 가능",
              lactationroom: "수유실 있음",
            },
          },
        },
      },
    };
    const client = new KoreaTourApiClient(new StaticHttpClient(response), {
      serviceKey: "test-service-key",
      mobileOs: "ETC",
      mobileApp: "BarrierFreeTrip",
    });
    const adapter = new KoreaTourAccessibilityAdapter(client);

    await expect(adapter.getAccessibility("126508", "12")).resolves.toEqual({
      parking: "장애인 주차장 있음",
      route: "접근로 설치",
      entrance: "주출입구 경사로 있음",
      elevator: "엘리베이터 있음",
      restroom: "장애인 화장실 있음",
      wheelchairRental: "휠체어 대여 가능",
      stroller: "유모차 대여 가능",
      lactationRoom: "수유실 있음",
    });
  });
});
