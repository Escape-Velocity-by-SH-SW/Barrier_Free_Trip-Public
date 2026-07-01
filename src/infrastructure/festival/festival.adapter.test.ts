import { describe, expect, it } from "vitest";

import type { HttpClient, HttpRequestOptions } from "../http/http-client.js";
import type { FestivalResponseDto } from "./festival.dto.js";
import { FestivalAdapter } from "./festival.adapter.js";
import { FestivalApiClient } from "./festival-api.client.js";

class StaticHttpClient implements HttpClient {
  constructor(private readonly response: unknown) {}

  requestJson<TResponse = unknown>(options: HttpRequestOptions): Promise<TResponse> {
    void options;
    return Promise.resolve(this.response as TResponse);
  }
}

describe("FestivalAdapter", () => {
  it("filters festivals by active date and radius", async () => {
    const response: FestivalResponseDto = {
      data: [
        {
          "축제명": "가까운 진행 축제",
          "축제시작일자": "2026-06-01",
          "축제종료일자": "2026-06-30",
          "위도": "37.579617",
          "경도": "126.976998",
        },
        {
          "축제명": "날짜 지난 축제",
          "축제시작일자": "2026-05-01",
          "축제종료일자": "2026-05-02",
          "위도": "37.579617",
          "경도": "126.976998",
        },
        {
          "축제명": "먼 축제",
          "축제시작일자": "2026-06-01",
          "축제종료일자": "2026-06-30",
          "위도": "35.179554",
          "경도": "129.075642",
        },
        {
          "축제명": "좌표 없는 축제",
          "축제시작일자": "2026-06-01",
          "축제종료일자": "2026-06-30",
        },
      ],
    };
    const client = new FestivalApiClient(new StaticHttpClient(response), {
      path: "/festival",
    });
    const adapter = new FestivalAdapter(client);

    await expect(
      adapter.findNearby({
        coordinates: { latitude: 37.579617, longitude: 126.976998 },
        visitDate: "2026-06-15",
        radiusKm: 3,
      }),
    ).resolves.toMatchObject([
      {
        name: "가까운 진행 축제",
      },
    ]);
  });

  it("excludes festivals with invalid date ranges", async () => {
    const response: FestivalResponseDto = {
      data: [
        {
          "축제명": "날짜 없는 축제",
          "위도": "37.579617",
          "경도": "126.976998",
        },
      ],
    };
    const client = new FestivalApiClient(new StaticHttpClient(response), {
      path: "/festival",
    });
    const adapter = new FestivalAdapter(client);

    await expect(
      adapter.findNearby({
        coordinates: { latitude: 37.579617, longitude: 126.976998 },
        visitDate: "2026-06-15",
        radiusKm: 3,
      }),
    ).resolves.toEqual([]);
  });
});
