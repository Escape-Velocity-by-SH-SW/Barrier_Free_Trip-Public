import { describe, expect, it } from "vitest";

import type { TourismAccessibilityRepository } from "../ports/tourism-accessibility.repository.js";
import type { WeatherRepository } from "../ports/weather.repository.js";
import type { WheelchairChargerRepository } from "../ports/wheelchair-charger.repository.js";
import type { FestivalRepository } from "../ports/festival.repository.js";
import { AccessibilityService } from "./accessibility.service.js";
import { ChargerService } from "./charger.service.js";
import { DestinationResolver } from "./destination-resolver.js";
import { FestivalRiskService } from "./festival-risk.service.js";
import { VisitAssessmentService } from "./visit-assessment.service.js";
import { WeatherService } from "./weather.service.js";

function createService(options: { deadlineMs?: number; searchDelayMs?: number } = {}): {
  service: VisitAssessmentService;
  getPeakSearches: () => number;
} {
  let activeSearches = 0;
  let peakSearches = 0;
  const tourismRepository: TourismAccessibilityRepository = {
    async searchDestination(keyword) {
      activeSearches += 1;
      peakSearches = Math.max(peakSearches, activeSearches);
      await new Promise((resolve) => setTimeout(resolve, options.searchDelayMs ?? 0));
      activeSearches -= 1;
      return [
        {
          name: keyword,
          normalizedName: keyword.replaceAll(/\s+/g, "").toLowerCase(),
          matchType: "EXACT",
          contentId: keyword,
          contentTypeId: "12",
          address: "서울특별시 종로구 세종로",
          coordinates: { latitude: 37.57, longitude: 126.97 },
        },
      ];
    },
    getAccessibility() {
      return Promise.resolve({ route: "휠체어 접근 가능" });
    },
  };
  const weatherRepository: WeatherRepository = {
    getForecast() {
      return Promise.resolve({
        baseDate: "20260807",
        baseTime: "1100",
        forecasts: [{ forecastDate: "2026-08-08", precipitationTypes: ["NONE"] }],
      });
    },
  };
  const chargerRepository: WheelchairChargerRepository = {
    findByRegion() {
      return Promise.resolve([]);
    },
  };
  const festivalRepository: FestivalRepository = {
    async findNearby(_query, context) {
      if (options.deadlineMs === undefined) {
        return [];
      }
      return new Promise((_resolve, reject) => {
        const abort = (): void => reject(new Error("aborted"));
        context?.signal?.addEventListener("abort", abort, { once: true });
      });
    },
  };

  const destinationResolver = new DestinationResolver(tourismRepository);
  return {
    service: new VisitAssessmentService(
      destinationResolver,
      new AccessibilityService(tourismRepository),
      new WeatherService(weatherRepository, () => new Date("2026-08-07T00:00:00Z")),
      new ChargerService(chargerRepository),
      new FestivalRiskService(festivalRepository),
      { overallDeadlineMs: options.deadlineMs ?? 1_000, destinationConcurrency: 2 },
    ),
    getPeakSearches: () => peakSearches,
  };
}

describe("VisitAssessmentService batch", () => {
  it("supports one and five destinations, safely deduplicates, and bounds candidate concurrency", async () => {
    const { service, getPeakSearches } = createService({ searchDelayMs: 5 });
    const single = await service.assessBatch({
      destinations: ["경복궁"],
      visitDate: "2026-08-08",
      travelerType: "POWER_WHEELCHAIR",
    });
    expect(single.status).toBe("SUCCESS");

    const batch = await service.assessBatch({
      destinations: ["경복궁", " 경복궁 ", "창덕궁", "덕수궁", "경희궁", "종묘"],
      visitDate: "2026-08-08",
      travelerType: "POWER_WHEELCHAIR",
    });
    expect(batch.requestedCandidateCount).toBe(6);
    expect(batch.candidateCount).toBe(5);
    expect(batch.results).toHaveLength(5);
    expect(getPeakSearches()).toBeLessThanOrEqual(2);
  });

  it("returns normal sources while a slow festival source is aborted by the overall deadline", async () => {
    const { service } = createService({ deadlineMs: 30 });
    const startedAt = performance.now();
    const result = await service.assess({
      destination: "경복궁",
      visitDate: "2026-08-08",
      travelerType: "POWER_WHEELCHAIR",
    });

    expect(performance.now() - startedAt).toBeLessThan(200);
    expect(result.accessibility.status).toBe("SUCCESS");
    expect(result.weather.status).toBe("AVAILABLE");
    expect(result.festivalRisk.status).toBe("FAILED");
    expect(result.overallAssessment.status).toBe("CHECK_REQUIRED");

    const batch = await service.assessBatch({
      destinations: ["경복궁"],
      visitDate: "2026-08-08",
      travelerType: "POWER_WHEELCHAIR",
    });
    expect(batch.status).toBe("PARTIAL_SUCCESS");
    expect(batch.results[0]?.assessment?.accessibility.status).toBe("SUCCESS");
    expect(batch.results[0]?.assessment?.festivalRisk.status).toBe("FAILED");
  });
});
