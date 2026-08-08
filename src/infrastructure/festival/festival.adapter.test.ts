import { describe, expect, it, vi } from "vitest";

import { FestivalAdapter, type FestivalClient } from "./festival.adapter.js";

describe("FestivalAdapter shared dataset", () => {
  it("downloads the nationwide dataset once for multiple destinations on the same date", async () => {
    const getAllFestivals = vi.fn<FestivalClient["getAllFestivals"]>().mockResolvedValue({
      data: [
        {
          축제명: "서울 축제",
          축제시작일자: "2026-08-01",
          축제종료일자: "2026-08-31",
          위도: "37.5796",
          경도: "126.9770",
        },
      ],
      totalCount: 1,
    });
    const adapter = new FestivalAdapter(
      { getAllFestivals },
      {
        dataset: { ttlMs: 1_000, maxEntries: 1 },
        dateIndex: { ttlMs: 1_000, maxEntries: 10 },
      },
    );

    const queries = [
      { latitude: 37.5796, longitude: 126.977 },
      { latitude: 37.58, longitude: 126.978 },
      { latitude: 37.581, longitude: 126.979 },
      { latitude: 37.582, longitude: 126.98 },
      { latitude: 37.583, longitude: 126.981 },
    ].map((coordinates) =>
      adapter.findNearby({ coordinates, visitDate: "2026-08-08", radiusKm: 5 }),
    );

    const results = await Promise.all(queries);
    expect(results.every((result) => result.length === 1)).toBe(true);
    expect(getAllFestivals).toHaveBeenCalledOnce();
  });
});
