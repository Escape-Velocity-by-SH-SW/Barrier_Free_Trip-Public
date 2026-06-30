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

export type WheelChairChargerClient = Pick<
  WheelChairChargerApiClient,
  "getWheelChairCharger"
>;

export class WheelChairChargerAdapter implements WheelchairChargerRepository {
  constructor(private readonly client: WheelChairChargerClient) {}

  async findByRegion(query: WheelchairChargerQuery): Promise<ChargerSourceData[]> {
    try {
      const response = await this.client.getWheelChairCharger({
        ctprvnNm: query.province,
        signguNm: query.cityCounty,
        ...(query.pageNo !== undefined ? { pageNo: query.pageNo } : {}),
        ...(query.numOfRows !== undefined ? { numOfRows: query.numOfRows } : {}),
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
