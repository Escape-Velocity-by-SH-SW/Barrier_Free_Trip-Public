import { z } from "zod/v4";

export const findNearbyWheelchairChargersInputSchema = {
  destination: z.string().trim().min(1),
  radiusKm: z.number().min(0.1).max(20).default(3),
  visitDateTime: z.string().optional(),
};

export const findNearbyWheelchairChargersOutputSchema = {
  status: z.enum(["SUCCESS", "NO_DATA", "FAILED", "NOT_APPLICABLE"]),
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
  radiusKm: z.number().positive(),
  chargers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      address: z.string().optional(),
      installationLocation: z.string().optional(),
      distanceKm: z.number().nonnegative(),
      operatingHours: z.string().optional(),
      simultaneousUseCount: z.number().int().nonnegative().optional(),
      managingOrganization: z.string().optional(),
      phoneNumber: z.string().optional(),
      referenceDate: z.string().optional(),
      realtimeAvailability: z.literal("UNKNOWN"),
    }),
  ),
  cautions: z.array(z.string()),
};
