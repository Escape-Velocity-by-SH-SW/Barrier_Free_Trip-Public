import { describe, expect, it } from "vitest";

import type { FestivalResponseDto } from "./festival.dto.js";
import { mapFestivalResponseToSourceData } from "./festival.mapper.js";

describe("mapFestivalResponseToSourceData", () => {
  it("maps standard festival rows to source data", () => {
    const response: FestivalResponseDto = {
      data: [
        {
          "축제명": "서울거리예술축제",
          "개최장소": "서울광장",
          "축제시작일자": "2026-10-01",
          "축제종료일자": "2026-10-03",
          "소재지도로명주소": "서울특별시 중구 세종대로 110",
          "소재지지번주소": "서울특별시 중구 태평로1가 31",
          "위도": "37.565703",
          "경도": "126.976861",
          "전화번호": "02-0000-0000",
          "데이터기준일자": "2026-01-01",
        },
      ],
    };

    expect(mapFestivalResponseToSourceData(response)).toEqual([
      {
        id: "서울거리예술축제|2026-10-01|서울광장|서울특별시 중구 세종대로 110",
        name: "서울거리예술축제",
        venue: "서울광장",
        address: "서울특별시 중구 세종대로 110",
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        latitude: 37.565703,
        longitude: 126.976861,
        phoneNumber: "02-0000-0000",
        referenceDate: "2026-01-01",
      },
    ]);
  });

  it("skips rows without a festival name and omits invalid coordinates", () => {
    const response: FestivalResponseDto = {
      data: [
        {
          "축제명": "",
          "위도": "37.1",
          "경도": "127.1",
        },
        {
          "축제명": "좌표 없는 축제",
          "위도": "",
          "경도": "not-a-number",
        },
      ],
    };

    expect(mapFestivalResponseToSourceData(response)).toEqual([
      {
        id: "좌표 없는 축제",
        name: "좌표 없는 축제",
      },
    ]);
  });
});
