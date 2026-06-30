import { describe, expect, it } from "vitest";

import { calculateDistanceKm } from "./geo.js";

describe("calculateDistanceKm", () => {
  it("calculates haversine distance in kilometers", () => {
    const distanceKm = calculateDistanceKm(
      { latitude: 37.579617, longitude: 126.976998 },
      { latitude: 37.570377, longitude: 126.981641 },
    );

    expect(distanceKm).toBeGreaterThan(1);
    expect(distanceKm).toBeLessThan(2);
  });
});
