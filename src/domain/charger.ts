// 충전소 원본 데이터, 거리 계산 후 결과 정의
import type { Destination } from "./destination.js";

export type ChargerDataFreshness = "FRESH" | "STALE" | "UNKNOWN";

export interface ChargerOperatingHours {
  weekdayStart?: string;
  weekdayEnd?: string;
  saturdayStart?: string;
  saturdayEnd?: string;
  holidayStart?: string;
  holidayEnd?: string;
}

export interface ChargerSourceData {
  name: string;
  address?: string;
  installationLocationDescription?: string;
  latitude?: number;
  longitude?: number;
  phoneNumber?: string;
  managingOrganization?: string; // 관리기관명
  referenceDate?: string; // 데이터 기준일자
  operatingHours?: ChargerOperatingHours;
}

export interface ChargerSummary {
  name: string;
  address?: string;
  installationLocationDescription?: string;
  distanceKm: number;
  managingOrganization?: string;
  phoneNumber?: string;
  referenceDate?: string;
  operatingHours?: ChargerOperatingHours;
  dataFreshness: ChargerDataFreshness;
  realtimeAvailability: "UNKNOWN";
}

export interface NearbyWheelchairChargerResult {
  status: "SUCCESS" | "NO_DATA" | "FAILED" | "NOT_APPLICABLE";
  destination: Destination;
  radiusKm: number;
  chargers: ChargerSummary[];
  cautions: string[]; // 필요한가?
}
