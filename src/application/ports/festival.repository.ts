// 전국축제정보 Adapter가 구현할 주변 축제 조회 계약
import type { Coordinates } from "../../domain/destination.js";
import type { FestivalSourceData } from "../../domain/festival.js";
import type { OperationContext } from "./operation-context.js";

export interface FestivalQuery {
  destinationName?: string;
  address?: string;
  coordinates: Coordinates;
  visitDate: string;
  radiusKm: number;
}

export interface FestivalRepository {
  findNearby(query: FestivalQuery, context?: OperationContext): Promise<FestivalSourceData[]>;
}
