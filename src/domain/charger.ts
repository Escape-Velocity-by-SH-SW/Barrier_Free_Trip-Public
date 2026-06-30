// 충전소 원본 데이터, 거리 계산 후 결과 정의
import type { Destination } from "./destination.js";

export interface ChargerSourceData {
  name: string;
  address?: string;
  installationLocationDescription?: string;
  latitude?: number;
  longitude?: number;
  phoneNumber?: string;
  managingOrganization?: string; // 관리기관명
  referenceDate?: string; // 데이터 기준일자
}

export interface ChargerSummary {
  name: string;
  address?: string;
  installationLocationDescription?: string;
  distanceKm: number;
  managingOrganization?: string;
  phoneNumber?: string;
  referenceDate?: string;
  realtimeAvailability: "UNKNOWN";
}

export interface NearbyWheelchairChargerResult {
  status: "SUCCESS" | "NO_DATA" | "FAILED" | "NOT_APPLICABLE";
  destination: Destination;
  chargers: ChargerSummary[];
  cautions: string[]; // 필요한가?
}
