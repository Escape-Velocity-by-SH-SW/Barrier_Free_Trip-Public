// 전동휠체어 충전소 Adapter가 구현할 지역별 원천 데이터 조회 계약
import type { ChargerSourceData } from "../../domain/charger.js";
import type { OperationContext } from "./operation-context.js";

export interface WheelchairChargerQuery {
  province: string; // 시도명
  cityCounty: string; // 시군구명
  pageNo?: number;
  numOfRows?: number;
}

export interface WheelchairChargerRepository {
  findByRegion(
    query: WheelchairChargerQuery,
    context?: OperationContext,
  ): Promise<ChargerSourceData[]>;
}

export interface WheelchairChargerRepositoryErrorDetails {
  userMessage?: string;
  cause?: unknown;
}

export class WheelchairChargerRepositoryError extends Error {
  readonly userMessage?: string;

  constructor(details: WheelchairChargerRepositoryErrorDetails) {
    super("Wheelchair charger repository failed.", {
      ...(details.cause !== undefined ? { cause: details.cause } : {}),
    });
    this.name = "WheelchairChargerRepositoryError";

    if (details.userMessage !== undefined) {
      this.userMessage = details.userMessage;
    }
  }
}
