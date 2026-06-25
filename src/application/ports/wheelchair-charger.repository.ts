// 전동휠체어 충전소 Adapter가 구현할 주변 검색 계약
import type { ChargerSourceData } from "../../domain/charger.js";
import type { Coordinates } from "../../domain/destination.js";

export interface WheelchairChargerQuery {
  coordinates: Coordinates;
  radiusKm: number;
}

export interface WheelchairChargerRepository {
  findNearby(query: WheelchairChargerQuery): Promise<ChargerSourceData[]>;
}
