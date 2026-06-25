import { z } from "zod/v4";

import { travelerTypes } from "../../domain/accessibility.js";

const evidenceItemSchema = z.object({
  status: z.enum(["CONFIRMED", "NOT_AVAILABLE", "NOT_PROVIDED", "CONFLICTING"]),
  description: z.string().optional(),
});

export const getDestinationAccessibilityInputSchema = {
  destination: z.string().trim().min(1),
  travelerType: z.enum(travelerTypes).optional(),
};

export const getDestinationAccessibilityOutputSchema = {
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
  travelerType: z.enum(travelerTypes).optional(),
  facilities: z.object({
    parking: evidenceItemSchema,
    route: evidenceItemSchema,
    entrance: evidenceItemSchema,
    elevator: evidenceItemSchema,
    restroom: evidenceItemSchema,
    wheelchairRental: evidenceItemSchema,
    stroller: evidenceItemSchema,
    lactationRoom: evidenceItemSchema,
  }),
  cautions: z.array(z.string()),
  unknowns: z.array(z.string()),
};
