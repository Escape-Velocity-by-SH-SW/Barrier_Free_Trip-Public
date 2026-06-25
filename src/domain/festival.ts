import type { Destination } from "./destination.js";

export type FestivalRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";

export interface FestivalSourceData {
  id: string;
  name: string;
  venue?: string;
  address?: string;
  startDate?: string;
  endDate?: string;
  latitude?: number;
  longitude?: number;
  phoneNumber?: string;
  referenceDate?: string;
}

export interface NearbyFestival {
  id: string;
  name: string;
  venue?: string;
  address?: string;
  startDate?: string;
  endDate?: string;
  distanceKm?: number;
  phoneNumber?: string;
  referenceDate?: string;
}

export interface DestinationFestivalRiskResult {
  status: "SUCCESS" | "NO_DATA" | "FAILED";
  destination: Destination;
  visitDate: string;
  radiusKm: number;
  riskLevel: FestivalRiskLevel;
  festivals: NearbyFestival[];
  cautions: string[];
}
