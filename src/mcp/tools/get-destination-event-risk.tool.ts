import { z } from "zod/v4";

export const getDestinationEventRiskInputSchema = {
  destination: z.string().trim().min(1),
  visitDate: z.iso.date(),
  radiusKm: z.number().min(0.1).max(20).default(3),
};

export const getDestinationEventRiskOutputSchema = {
  status: z.enum(["SUCCESS", "NO_DATA", "FAILED"]),
  destination: z.object({
    name: z.string(),
    contentId: z.string(),
    contentTypeId: z.string(),
    address: z.string().optional(),
    coordinates: z.object({
      latitude: z.number(),
      longitude: z.number(),
    }),
  }),
  visitDate: z.iso.date(),
  radiusKm: z.number().positive(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]),
  festivals: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      venue: z.string().optional(),
      address: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      distanceKm: z.number().optional(),
      phoneNumber: z.string().optional(),
      referenceDate: z.string().optional(),
    }),
  ),
  cautions: z.array(z.string()),
};
