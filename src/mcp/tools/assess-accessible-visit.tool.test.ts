import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import {
  assessAccessibleVisitInputSchema,
  validateDestinationInput,
} from "./assess-accessible-visit.tool.js";

const inputSchema = z.object(assessAccessibleVisitInputSchema);
const baseInput = {
  visitDate: "2026-08-08",
  travelerType: "POWER_WHEELCHAIR" as const,
};

describe("assess_accessible_visit input", () => {
  it("accepts legacy destination and batches of one or five", () => {
    expect(inputSchema.safeParse({ ...baseInput, destination: "경복궁" }).success).toBe(true);
    expect(inputSchema.safeParse({ ...baseInput, destinations: ["경복궁"] }).success).toBe(true);
    expect(
      inputSchema.safeParse({
        ...baseInput,
        destinations: ["경복궁", "창덕궁", "덕수궁", "경희궁", "종묘"],
      }).success,
    ).toBe(true);
  });

  it("rejects empty and over-limit batches", () => {
    expect(inputSchema.safeParse({ ...baseInput, destinations: [] }).success).toBe(false);
    expect(
      inputSchema.safeParse({ ...baseInput, destinations: ["1", "2", "3", "4", "5", "6"] }).success,
    ).toBe(false);
  });

  it("requires exactly one destination field and disallows batch contentId", () => {
    expect(validateDestinationInput({})).toContain("정확히 하나");
    expect(validateDestinationInput({ destination: "A", destinations: ["B"] })).toContain(
      "정확히 하나",
    );
    expect(validateDestinationInput({ destinations: ["A"], contentId: "1" })).toContain("단일");
  });
});
