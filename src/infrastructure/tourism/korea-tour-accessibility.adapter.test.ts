import { describe, expect, it, vi } from "vitest";

import { DestinationResolver } from "../../application/services/destination-resolver.js";
import {
  KoreaTourAccessibilityAdapter,
  type KoreaTourClient,
} from "./korea-tour-accessibility.adapter.js";

describe("destination resolution cache and single-flight", () => {
  it("turns ten concurrent resolutions for one destination into one search call", async () => {
    const searchKeyword = vi.fn<KoreaTourClient["searchKeyword"]>().mockResolvedValue({
      response: {
        body: {
          items: {
            item: [
              {
                contentid: "1",
                contenttypeid: "12",
                title: "경복궁",
                addr1: "서울특별시 종로구",
                mapx: "126.9770",
                mapy: "37.5796",
              },
            ],
          },
        },
      },
    });
    const getDetailWithTour = vi.fn<KoreaTourClient["getDetailWithTour"]>();
    const adapter = new KoreaTourAccessibilityAdapter(
      { searchKeyword, getDetailWithTour },
      {
        destination: { ttlMs: 1_000, maxEntries: 10 },
        accessibility: { ttlMs: 1_000, maxEntries: 10 },
      },
    );
    const resolver = new DestinationResolver(adapter);

    const resolutions = await Promise.all(
      Array.from({ length: 10 }, () => resolver.resolve("경복궁")),
    );

    expect(resolutions.every((result) => result.status === "RESOLVED")).toBe(true);
    expect(searchKeyword).toHaveBeenCalledOnce();
  });
});
