import { describe, expect, it } from "vitest";

import { ChargerService } from "./charger.service.js";
import type { WheelchairChargerRepository } from "../ports/wheelchair-charger.repository.js";
import type { ChargerSourceData } from "../../domain/charger.js";
import type { Destination } from "../../domain/destination.js";

const destination: Destination = {
  name: "테스트 관광지",
  contentId: "1",
  contentTypeId: "12",
  address: "서울특별시 종로구",
  coordinates: { latitude: 37.5, longitude: 127.0 },
};

function toDateString(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function createRepository(chargers: ChargerSourceData[]): WheelchairChargerRepository {
  return {
    findByRegion(): Promise<ChargerSourceData[]> {
      return Promise.resolve(chargers);
    },
  };
}

describe("ChargerService.findNearbyChargers", () => {
  it("반경 이내 충전소만 반환하고 반경 밖 충전소는 제외한다", async () => {
    const nearCharger: ChargerSourceData = {
      name: "가까운 충전소",
      latitude: 37.51, // 약 1.1km
      longitude: 127.0,
    };
    const farCharger: ChargerSourceData = {
      name: "먼 충전소",
      latitude: 37.55, // 약 5.6km
      longitude: 127.0,
    };
    const service = new ChargerService(createRepository([nearCharger, farCharger]));

    const result = await service.findNearbyChargers({ destination, radiusKm: 3 });

    expect(result.status).toBe("SUCCESS");
    expect(result.radiusKm).toBe(3);
    expect(result.chargers.map((charger) => charger.name)).toEqual(["가까운 충전소"]);
  });

  it("반경 필터 후 결과가 없으면 NO_DATA를 반환한다", async () => {
    const farCharger: ChargerSourceData = {
      name: "먼 충전소",
      latitude: 37.55,
      longitude: 127.0,
    };
    const service = new ChargerService(createRepository([farCharger]));

    const result = await service.findNearbyChargers({ destination, radiusKm: 3 });

    expect(result.status).toBe("NO_DATA");
    expect(result.radiusKm).toBe(3);
    expect(result.chargers).toEqual([]);
  });

  it("radiusKm을 지정하지 않으면 기본값 3km가 적용된다", async () => {
    const service = new ChargerService(createRepository([]));

    const result = await service.findNearbyChargers({ destination });

    expect(result.radiusKm).toBe(3);
  });

  it("데이터기준일자가 180일을 초과하면 STALE, 이내면 FRESH로 평가한다", async () => {
    const freshCharger: ChargerSourceData = {
      name: "최신 충전소",
      latitude: 37.51,
      longitude: 127.0,
      referenceDate: toDateString(10),
    };
    const staleCharger: ChargerSourceData = {
      name: "오래된 충전소",
      latitude: 37.509,
      longitude: 127.0,
      referenceDate: toDateString(200),
    };
    const service = new ChargerService(createRepository([freshCharger, staleCharger]));

    const result = await service.findNearbyChargers({ destination, radiusKm: 3 });

    const freshnessByName = new Map(
      result.chargers.map((charger) => [charger.name, charger.dataFreshness]),
    );
    expect(freshnessByName.get("최신 충전소")).toBe("FRESH");
    expect(freshnessByName.get("오래된 충전소")).toBe("STALE");
    expect(result.cautions.some((caution) => caution.includes("오래된 충전소"))).toBe(true);
  });

  it("데이터기준일자가 없거나 형식을 알 수 없으면 UNKNOWN으로 평가한다", async () => {
    const missingReferenceDate: ChargerSourceData = {
      name: "기준일 없는 충전소",
      latitude: 37.51,
      longitude: 127.0,
    };
    const unparseableReferenceDate: ChargerSourceData = {
      name: "형식 불명 충전소",
      latitude: 37.509,
      longitude: 127.0,
      referenceDate: "확인불가",
    };
    const service = new ChargerService(
      createRepository([missingReferenceDate, unparseableReferenceDate]),
    );

    const result = await service.findNearbyChargers({ destination, radiusKm: 3 });

    for (const charger of result.chargers) {
      expect(charger.dataFreshness).toBe("UNKNOWN");
    }
  });

  it("realtimeAvailability는 항상 UNKNOWN으로 유지된다", async () => {
    const charger: ChargerSourceData = {
      name: "충전소",
      latitude: 37.51,
      longitude: 127.0,
    };
    const service = new ChargerService(createRepository([charger]));

    const result = await service.findNearbyChargers({ destination, radiusKm: 3 });

    expect(result.chargers[0]?.realtimeAvailability).toBe("UNKNOWN");
  });
});
