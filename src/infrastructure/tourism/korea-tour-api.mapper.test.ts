import { describe, expect, it } from "vitest";

import type {
  DetailWithTourResponseDto,
  SearchKeywordResponseDto,
} from "./korea-tour-api.dto.js";
import {
  mapDetailWithTourResponseToAccessibilitySourceData,
  mapSearchKeywordResponseToDestinationCandidates,
} from "./korea-tour-api.mapper.js";

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

describe("mapDetailWithTourResponseToAccessibilitySourceData", () => {
  it("maps a detailWithTour item to accessibility source data", () => {
    const response: DetailWithTourResponseDto = {
      response: {
        body: {
          items: {
            item: {
              contentid: "126508",
              parking: "장애인 주차장 있음",
              route: "접근로 설치",
              exit: "주출입구 경사로 있음",
              elevator: "엘리베이터 있음",
              restroom: "장애인 화장실 있음",
              wheelchair: "휠체어 대여 가능",
              stroller: "유모차 대여 가능",
              lactationroom: "수유실 있음",
              publictransport: "지하철 이용 가능",
            },
          },
        },
      },
    };

    expect(mapDetailWithTourResponseToAccessibilitySourceData(response)).toEqual({
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

  it("omits empty fields and preserves sentence notes", () => {
    const response: DetailWithTourResponseDto = {
      response: {
        body: {
          items: {
            item: {
              parking: "",
              route: null,
              restroom: "현장 상황에 따라 이용 전 확인 필요",
            },
          },
        },
      },
    };

    expect(mapDetailWithTourResponseToAccessibilitySourceData(response)).toEqual({
      restroom: "현장 상황에 따라 이용 전 확인 필요",
    });
  });

  it("returns an empty source data object when detailWithTour has no items", () => {
    const response: DetailWithTourResponseDto = {
      response: {
        body: {
          items: "",
          totalCount: "0",
        },
      },
    };

    expect(mapDetailWithTourResponseToAccessibilitySourceData(response)).toEqual({});
  });
});
