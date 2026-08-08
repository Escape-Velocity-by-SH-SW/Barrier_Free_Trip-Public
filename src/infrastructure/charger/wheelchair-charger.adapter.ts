import type {
  WheelchairChargerQuery,
  WheelchairChargerRepository,
} from "../../application/ports/wheelchair-charger.repository.js";
import { WheelchairChargerRepositoryError } from "../../application/ports/wheelchair-charger.repository.js";
import type { ChargerSourceData } from "../../domain/charger.js";
import {
  WheelchairChargerApiError,
  type WheelChairChargerApiClient,
} from "./wheelchair-charger-api.client.js";
import { mapWheelchairChargerItems } from "./wheelchair-charger.mapper.js";
import type { OperationContext } from "../../application/ports/operation-context.js";
import { CachedLoader, type CachedLoaderOptions } from "../cache/cached-loader.js";

export type WheelChairChargerClient = Pick<WheelChairChargerApiClient, "getWheelChairCharger">;

export class WheelChairChargerAdapter implements WheelchairChargerRepository {
  private readonly loader: CachedLoader<string, ChargerSourceData[]>;

  constructor(
    private readonly client: WheelChairChargerClient,
    cacheOptions: CachedLoaderOptions,
  ) {
    this.loader = new CachedLoader("charger", cacheOptions);
  }

  async findByRegion(
    query: WheelchairChargerQuery,
    context?: OperationContext,
  ): Promise<ChargerSourceData[]> {
    const key = `${normalizeRegion(query.province)}|${normalizeRegion(query.cityCounty)}`;
    return this.loader.load(key, context, () => this.fetchByRegion(query, context));
  }

  private async fetchByRegion(
    query: WheelchairChargerQuery,
    context: OperationContext | undefined,
  ): Promise<ChargerSourceData[]> {
    try {
      const response = await this.client.getWheelChairCharger({
        ctprvnNm: query.province,
        signguNm: query.cityCounty,
        ...(query.pageNo !== undefined ? { pageNo: query.pageNo } : {}),
        ...(query.numOfRows !== undefined ? { numOfRows: query.numOfRows } : {}),
        ...(context !== undefined ? { context } : {}),
      });

      return mapWheelchairChargerItems(response.items);
    } catch (error) {
      if (error instanceof WheelchairChargerApiError) {
        throw new WheelchairChargerRepositoryError({
          userMessage: error.userMessage,
          cause: error,
        });
      }

      throw new WheelchairChargerRepositoryError({ cause: error });
    }
  }
}

function normalizeRegion(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}
