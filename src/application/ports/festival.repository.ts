// 전국축제정보 Adapter가 구현할 주변 축제 조회 계약
import type { Coordinates } from "../../domain/destination.js";
import type { FestivalSourceData } from "../../domain/festival.js";

export interface FestivalQuery {
  coordinates: Coordinates;
  visitDate: string;
  radiusKm: number;
}

export interface FestivalRepository {
  findNearby(query: FestivalQuery): Promise<FestivalSourceData[]>;
}
