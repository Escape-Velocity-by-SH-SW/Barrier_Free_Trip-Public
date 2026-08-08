import { describe, expect, it } from "vitest";

import { createContainer } from "./create-container.js";

const validEnvironment: NodeJS.ProcessEnv = {
  TOUR_API_BASE_URL: "https://tour.example.test",
  TOUR_API_SERVICE_KEY: "tour-key",
  KMA_WEATHER_API_BASE_URL: "https://weather.example.test",
  KMA_WEATHER_API_SERVICE_KEY: "weather-key",
  WHEELCHAIR_CHARGER_API_BASE_URL: "https://charger.example.test",
  WHEELCHAIR_CHARGER_API_SERVICE_KEY: "charger-key",
  FESTIVAL_API_BASE_URL: "https://festival.example.test",
  FESTIVAL_API_SERVICE_KEY: "festival-key",
};

describe("createContainer environment configuration", () => {
  it("builds the same application container from process-style injected environment values", () => {
    expect(createContainer(validEnvironment).services.visitAssessmentService).toBeDefined();
  });

  it("fails startup when a required externally injected value is absent", () => {
    const environment = { ...validEnvironment };
    delete environment.TOUR_API_SERVICE_KEY;

    expect(() => createContainer(environment)).toThrow(
      "Missing required environment variable: TOUR_API_SERVICE_KEY",
    );
  });
});
