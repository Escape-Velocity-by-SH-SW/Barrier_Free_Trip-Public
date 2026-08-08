import { describe, expect, it } from "vitest";

import type { HttpClient } from "../http/http-client.js";
import { WheelChairChargerApiClient } from "./wheelchair-charger-api.client.js";

describe("WheelChairChargerApiClient", () => {
  it("parses the public API top-level body and nested item array", async () => {
    const httpClient: HttpClient = {
      requestJson: <TResponse>() => {
        const response: unknown = {
          header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
          body: {
            items: {
              item: [{ fcltyNm: "종로구 전동휠체어 충전소" }],
            },
            totalCount: 1,
            numOfRows: 1000,
            pageNo: 1,
          },
        };

        return Promise.resolve(response as TResponse);
      },
    };
    const client = new WheelChairChargerApiClient(httpClient, {
      endpointUrl: "/chargers",
      serviceKey: "test-key",
    });

    await expect(
      client.getWheelChairCharger({ ctprvnNm: "서울특별시", signguNm: "종로구" }),
    ).resolves.toEqual({
      items: [{ fcltyNm: "종로구 전동휠체어 충전소" }],
      totalCount: "1",
      numOfRows: "1000",
      pageNo: "1",
    });
  });
});
