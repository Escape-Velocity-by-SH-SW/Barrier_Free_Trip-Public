import { afterEach, describe, expect, it, vi } from "vitest";

import type { FestivalRepository } from "../ports/festival.repository.js";
import type { Destination } from "../../domain/destination.js";
import type { FestivalSourceData } from "../../domain/festival.js";
import { FestivalRiskService } from "./festival-risk.service.js";

const destination: Destination = {
  name: "경복궁",
  contentId: "126508",
  contentTypeId: "12",
  address: "서울특별시 종로구",
  coordinates: {
    latitude: 37.579617,
    longitude: 126.976998,
  },
};

describe("FestivalRiskService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns LOW risk with NO_DATA when there are no nearby festivals", async () => {
    const service = new FestivalRiskService(createRepository([]));

    await expect(
      service.assess({
        destination,
        visitDate: "2026-06-15",
        radiusKm: 3,
      }),
    ).resolves.toMatchObject({
      status: "NO_DATA",
      riskLevel: "LOW",
      festivals: [],
    });
  });

  it("returns HIGH risk when a festival is within one kilometer", async () => {
    const service = new FestivalRiskService(
      createRepository([
        {
          id: "near",
          name: "가까운 축제",
          venue: "광화문광장",
          startDate: "2026-06-01",
          endDate: "2026-06-30",
          latitude: 37.5759,
          longitude: 126.9768,
        },
      ]),
    );

    await expect(
      service.assess({
        destination,
        visitDate: "2026-06-15",
        radiusKm: 3,
      }),
    ).resolves.toMatchObject({
      status: "SUCCESS",
      riskLevel: "HIGH",
      festivals: [
        {
          id: "near",
          name: "가까운 축제",
          distanceKm: expect.any(Number) as number,
        },
      ],
    });
  });

  it("returns HIGH risk when multiple festivals are nearby", async () => {
    const service = new FestivalRiskService(
      createRepository([
        {
          id: "first",
          name: "첫 번째 축제",
          latitude: 37.570377,
          longitude: 126.981641,
        },
        {
          id: "second",
          name: "두 번째 축제",
          latitude: 37.568316,
          longitude: 126.977829,
        },
      ]),
    );

    await expect(
      service.assess({
        destination,
        visitDate: "2026-06-15",
        radiusKm: 3,
      }),
    ).resolves.toMatchObject({
      status: "SUCCESS",
      riskLevel: "HIGH",
    });
  });

  it("returns FAILED and logs context when the repository rejects", async () => {
    const error = Object.assign(new Error("festival lookup failed"), {
      kind: "NETWORK_ERROR",
      status: 503,
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const repository: FestivalRepository = {
      findNearby: vi.fn(() => Promise.reject(error)),
    };
    const service = new FestivalRiskService(repository);

    await expect(
      service.assess({
        destination,
        visitDate: "2026-06-15",
      }),
    ).resolves.toMatchObject({
      status: "FAILED",
      riskLevel: "UNKNOWN",
      festivals: [],
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[FestivalRiskService] failed to assess festival risk",
      expect.objectContaining({
        destination,
        visitDate: "2026-06-15",
        radiusKm: 3,
        error: expect.objectContaining({
          name: "Error",
          message: "festival lookup failed",
          kind: "NETWORK_ERROR",
          status: 503,
        }) as Record<string, unknown>,
      }),
    );
  });
});

function createRepository(festivals: FestivalSourceData[]): FestivalRepository {
  return {
    findNearby: vi.fn(() => Promise.resolve(festivals)),
  };
}
