import type { Destination } from "./destination.js";

export const travelerTypes = [
  "POWER_WHEELCHAIR",
  "MANUAL_WHEELCHAIR",
  "STROLLER",
  "ELDERLY_COMPANION",
] as const;

export type TravelerType = (typeof travelerTypes)[number];

export type EvidenceStatus = "CONFIRMED" | "NOT_AVAILABLE" | "NOT_PROVIDED" | "CONFLICTING";

export interface EvidenceItem {
  status: EvidenceStatus;
  description?: string;
}

export interface AccessibilityFacilities {
  parking: EvidenceItem;
  route: EvidenceItem;
  entrance: EvidenceItem;
  elevator: EvidenceItem;
  restroom: EvidenceItem;
  wheelchairRental: EvidenceItem;
  stroller: EvidenceItem;
  lactationRoom: EvidenceItem;
}

export interface AccessibilitySourceData {
  parking?: string;
  route?: string;
  entrance?: string;
  elevator?: string;
  restroom?: string;
  wheelchairRental?: string;
  stroller?: string;
  lactationRoom?: string;
}

export interface DestinationAccessibilityResult {
  status: "SUCCESS" | "NO_DATA" | "FAILED";
  destination: Destination;
  travelerType?: TravelerType;
  facilities: AccessibilityFacilities;
  cautions: string[];
  unknowns: string[];
}
