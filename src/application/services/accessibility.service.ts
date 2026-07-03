import type { TourismAccessibilityRepository } from "../ports/tourism-accessibility.repository.js";
import type {
  AccessibilityFacilities,
  AccessibilitySourceData,
  DestinationAccessibilityResult,
  EvidenceItem,
  TravelerType,
} from "../../domain/accessibility.js";
import type { Destination } from "../../domain/destination.js";
import { touristAttractionContentTypeId } from "../../domain/destination.js";

export interface AccessibilityServiceRequest {
  destination: Destination;
  travelerType?: TravelerType;
}

export interface AccessibilityByContentIdRequest {
  contentId: string;
  contentTypeId?: string;
  travelerType?: TravelerType;
}

export interface AccessibilityLookupResult {
  status: "SUCCESS" | "NO_DATA" | "FAILED";
  travelerType?: TravelerType;
  facilities: AccessibilityFacilities;
  cautions: string[];
  unknowns: string[];
}

const unavailableKeywords = ["없음", "불가", "해당없음", "미설치", "불가능"];
const facilityKeys = [
  "parking",
  "route",
  "entrance",
  "elevator",
  "restroom",
  "wheelchairRental",
  "stroller",
  "lactationRoom",
] as const satisfies readonly (keyof AccessibilityFacilities)[];

const facilityLabels = {
  parking: "장애인 주차장",
  route: "접근로",
  entrance: "출입구",
  elevator: "엘리베이터",
  restroom: "장애인 화장실",
  wheelchairRental: "휠체어 대여",
  stroller: "유모차 대여",
  lactationRoom: "수유실",
} as const satisfies Readonly<Record<keyof AccessibilityFacilities, string>>;

export class AccessibilityService {
  constructor(private readonly repository: TourismAccessibilityRepository) {}

  async getAccessibility(
    request: AccessibilityServiceRequest,
  ): Promise<DestinationAccessibilityResult> {
    try {
      const sourceData = await this.repository.getAccessibility(
        request.destination.contentId,
        request.destination.contentTypeId,
      );
      return {
        ...createLookupResult(sourceData, request.travelerType),
        destination: request.destination,
      };
    } catch (error) {
      logAccessibilityLookupFailure("getAccessibility", {
        contentId: request.destination.contentId,
        contentTypeId: request.destination.contentTypeId,
        error,
      });

      return {
        ...createFailedLookupResult(request.travelerType),
        status: "FAILED",
        destination: request.destination,
      };
    }
  }

  async getAccessibilityByContentId(
    request: AccessibilityByContentIdRequest,
  ): Promise<AccessibilityLookupResult> {
    try {
      const sourceData = await this.repository.getAccessibility(
        request.contentId,
        request.contentTypeId ?? touristAttractionContentTypeId,
      );

      return createLookupResult(sourceData, request.travelerType);
    } catch (error) {
      logAccessibilityLookupFailure("getAccessibilityByContentId", {
        contentId: request.contentId,
        contentTypeId: request.contentTypeId ?? touristAttractionContentTypeId,
        error,
      });

      return createFailedLookupResult(request.travelerType);
    }
  }
}

function logAccessibilityLookupFailure(
  methodName: "getAccessibility" | "getAccessibilityByContentId",
  context: {
    contentId: string;
    contentTypeId: string;
    error: unknown;
  },
): void {
  console.error("[AccessibilityService] failed to lookup accessibility", {
    methodName,
    contentId: context.contentId,
    contentTypeId: context.contentTypeId,
    error: toLoggableError(context.error),
  });
}

function toLoggableError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
    };
  }

  return { value: error };
}

function createLookupResult(
  sourceData: AccessibilitySourceData,
  travelerType: TravelerType | undefined,
): AccessibilityLookupResult {
  const facilities = toFacilities(sourceData);
  const unknowns = getUnknownFacilityNames(facilities);

  return {
    status: hasProvidedFacility(facilities) ? "SUCCESS" : "NO_DATA",
    ...(travelerType !== undefined ? { travelerType } : {}),
    facilities,
    cautions: createCautions(facilities, travelerType),
    unknowns,
  };
}

function createFailedLookupResult(
  travelerType: TravelerType | undefined,
): AccessibilityLookupResult {
  const facilities = createNotProvidedFacilities();

  return {
    status: "FAILED",
    ...(travelerType !== undefined ? { travelerType } : {}),
    facilities,
    cautions: ["무장애 편의시설 정보를 조회하지 못했습니다. 방문 전 현장에 확인하세요."],
    unknowns: getUnknownFacilityNames(facilities),
  };
}

function toFacilities(sourceData: AccessibilitySourceData): AccessibilityFacilities {
  return {
    parking: toEvidenceItem(sourceData.parking),
    route: toEvidenceItem(sourceData.route),
    entrance: toEvidenceItem(sourceData.entrance),
    elevator: toEvidenceItem(sourceData.elevator),
    restroom: toEvidenceItem(sourceData.restroom),
    wheelchairRental: toEvidenceItem(sourceData.wheelchairRental),
    stroller: toEvidenceItem(sourceData.stroller),
    lactationRoom: toEvidenceItem(sourceData.lactationRoom),
  };
}

function toEvidenceItem(value: string | undefined): EvidenceItem {
  const description = normalizeText(value);

  if (description === undefined) {
    return { status: "NOT_PROVIDED" };
  }

  return {
    status: includesUnavailableKeyword(description) ? "NOT_AVAILABLE" : "CONFIRMED",
    description,
  };
}

function includesUnavailableKeyword(value: string): boolean {
  return unavailableKeywords.some((keyword) => value.includes(keyword));
}

function normalizeText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function createNotProvidedFacilities(): AccessibilityFacilities {
  return {
    parking: { status: "NOT_PROVIDED" },
    route: { status: "NOT_PROVIDED" },
    entrance: { status: "NOT_PROVIDED" },
    elevator: { status: "NOT_PROVIDED" },
    restroom: { status: "NOT_PROVIDED" },
    wheelchairRental: { status: "NOT_PROVIDED" },
    stroller: { status: "NOT_PROVIDED" },
    lactationRoom: { status: "NOT_PROVIDED" },
  };
}

function hasProvidedFacility(facilities: AccessibilityFacilities): boolean {
  return facilityKeys.some((facilityKey) => facilities[facilityKey].status !== "NOT_PROVIDED");
}

function getUnknownFacilityNames(facilities: AccessibilityFacilities): string[] {
  return facilityKeys
    .filter((facilityKey) => facilities[facilityKey].status === "NOT_PROVIDED")
    .map((facilityKey) => facilityLabels[facilityKey]);
}

function createCautions(
  facilities: AccessibilityFacilities,
  travelerType: TravelerType | undefined,
): string[] {
  const cautions = ["공공데이터 기준 정보이므로 운영 여부는 방문 전 현장에 확인하세요."];

  if (travelerType === "POWER_WHEELCHAIR" || travelerType === "MANUAL_WHEELCHAIR") {
    addFacilityCaution(cautions, facilities.route, "접근로 정보가 확인되지 않았습니다.");
    addFacilityCaution(cautions, facilities.elevator, "엘리베이터 정보가 확인되지 않았습니다.");
    addFacilityCaution(cautions, facilities.restroom, "장애인 화장실 정보가 확인되지 않았습니다.");
  }

  if (travelerType === "STROLLER") {
    addFacilityCaution(cautions, facilities.stroller, "유모차 대여 정보가 확인되지 않았습니다.");
    addFacilityCaution(cautions, facilities.lactationRoom, "수유실 정보가 확인되지 않았습니다.");
  }

  return cautions;
}

function addFacilityCaution(cautions: string[], facility: EvidenceItem, message: string): void {
  if (facility.status === "NOT_PROVIDED") {
    cautions.push(message);
  }
}
