// 충전소 원본 데이터, 거리 계산 후 결과 정의
import type { Destination } from "./destination.js";

export interface ChargerSourceData {
  id: string;
  name: string;
  address?: string;
  installationLocation?: string;
  latitude?: number;
  longitude?: number;
  operatingHours?: string;
  simultaneousUseCount?: number;
  managingOrganization?: string;
  phoneNumber?: string;
  referenceDate?: string;
}

export interface ChargerSummary {
  id: string;
  name: string;
  address?: string;
  installationLocation?: string;
  distanceKm: number;
  operatingHours?: string;
  simultaneousUseCount?: number;
  managingOrganization?: string;
  phoneNumber?: string;
  referenceDate?: string;
  realtimeAvailability: "UNKNOWN";
}

export interface NearbyWheelchairChargerResult {
  status: "SUCCESS" | "NO_DATA" | "FAILED" | "NOT_APPLICABLE";
  destination: Destination;
  radiusKm: number;
  chargers: ChargerSummary[];
  cautions: string[];
}
