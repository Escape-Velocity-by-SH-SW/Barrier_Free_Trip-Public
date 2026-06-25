import type { DestinationAccessibilityResult, TravelerType } from "./accessibility.js";
import type { NearbyWheelchairChargerResult } from "./charger.js";
import type { Destination } from "./destination.js";
import type { DestinationFestivalRiskResult } from "./festival.js";
import type { DestinationWeatherResult } from "./weather.js";

export type VisitAssessmentStatus =
  | "LIKELY_ACCESSIBLE"
  | "ACCESSIBLE_WITH_CAUTION"
  | "CHECK_REQUIRED"
  | "INSUFFICIENT_DATA";

export type CautionLevel = "LOW" | "MEDIUM" | "HIGH";

export type CautionDomain = "ACCESSIBILITY" | "WEATHER" | "CHARGER" | "FESTIVAL";

export interface CautionItem {
  code: string;
  level: CautionLevel;
  domains: CautionDomain[];
  message: string;
  evidence: string[];
}

export interface ChecklistItem {
  code: string;
  label: string;
  required: boolean;
}

export interface AccessibleVisitAssessment {
  destination: Destination;
  visit: {
    date: string;
    travelerType: TravelerType;
    radiusKm: number;
  };
  overallAssessment: {
    status: VisitAssessmentStatus;
    reasons: string[];
  };
  accessibility: DestinationAccessibilityResult;
  weather: DestinationWeatherResult;
  chargers: NearbyWheelchairChargerResult;
  festivalRisk: DestinationFestivalRiskResult;
  combinedCautions: CautionItem[];
  unknowns: string[];
  checklist: ChecklistItem[];
  phoneCheckQuestions: string[];
}
