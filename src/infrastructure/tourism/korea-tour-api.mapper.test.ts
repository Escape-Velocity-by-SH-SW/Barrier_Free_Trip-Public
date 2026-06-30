import { describe, expect, it } from "vitest";

import type { SearchKeywordResponseDto } from "./korea-tour-api.dto.js";
import { mapSearchKeywordResponseToDestinationCandidates } from "./korea-tour-api.mapper.js";

describe("mapSearchKeywordResponseToDestinationCandidates", () => {
  it("maps a single Tour API item to a destination candidate", () => {
    const response: SearchKeywordResponseDto = {
      response: {
        body: {
          items: {
            item: {
              contentid: "126508",
              contenttypeid: "12",
              title: " 경복궁 ",
              addr1: "서울특별시 종로구 사직로 161",
              addr2: "세종로",
              mapx: "126.976998",
              mapy: "37.579617",
              firstimage: "https://example.test/image.jpg",
            },
          },
          totalCount: "1",
        },
      },
    };

    const candidates = mapSearchKeywordResponseToDestinationCandidates(response, "경복궁");

    expect(candidates).toEqual([
      {
        name: "경복궁",
        contentId: "126508",
        contentTypeId: "12",
        address: "서울특별시 종로구 사직로 161 세종로",
        coordinates: {
          latitude: 37.579617,
          longitude: 126.976998,
        },
        normalizedName: "경복궁",
        matchType: "EXACT",
      },
    ]);
  });

  it("normalizes array items and skips rows without required domain fields", () => {
    const response: SearchKeywordResponseDto = {
      response: {
        body: {
          items: {
            item: [
              {
                contentid: "1",
                contenttypeid: "12",
                title: "경복궁 야간관람",
                mapx: "126.976998",
                mapy: "37.579617",
              },
              {
                contentid: "2",
                contenttypeid: "12",
                title: "좌표 없는 관광지",
                mapx: "",
                mapy: "37.579617",
              },
            ],
          },
        },
      },
    };

    const candidates = mapSearchKeywordResponseToDestinationCandidates(response, "경복궁");

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "경복궁 야간관람",
      matchType: "PARTIAL",
    });
  });

  it("returns an empty array when the API response has no items", () => {
    const response: SearchKeywordResponseDto = {
      response: {
        body: {
          items: "",
          totalCount: "0",
        },
      },
    };

    expect(mapSearchKeywordResponseToDestinationCandidates(response, "경복궁")).toEqual([]);
  });
});
