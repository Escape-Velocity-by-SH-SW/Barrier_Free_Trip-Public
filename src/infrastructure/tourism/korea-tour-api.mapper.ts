import type { AccessibilitySourceData } from "../../domain/accessibility.js";
import type { DestinationCandidate } from "../../domain/destination.js";
import type {
  DetailWithTourResponseDto,
  SearchKeywordItemDto,
  SearchKeywordResponseDto,
  TourApiItemDto,
  TourApiItemsDto,
} from "./korea-tour-api.dto.js";

const namedHtmlEntities: Readonly<Record<string, string>> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  middot: "·",
  bull: "•",
};

export function mapSearchKeywordResponseToDestinationCandidates(
  response: SearchKeywordResponseDto,
  keyword: string,
): DestinationCandidate[] {
  return normalizeTourApiItems(response.response?.body?.items)
    .map((item) => mapSearchKeywordItemToDestinationCandidate(item, keyword))
    .filter((candidate): candidate is DestinationCandidate => candidate !== undefined);
}

export function mapDetailWithTourResponseToAccessibilitySourceData(
  response: DetailWithTourResponseDto,
): AccessibilitySourceData {
  const item = normalizeTourApiItems(response.response?.body?.items).at(0);

  if (item === undefined) {
    return {};
  }

  return {
    ...optionalField("parking", item.parking),
    ...optionalField("route", item.route),
    ...optionalField("entrance", item.exit),
    ...optionalField("elevator", item.elevator),
    ...optionalField("restroom", item.restroom),
    ...optionalField("wheelchairRental", item.wheelchair),
    ...optionalField("stroller", item.stroller),
    ...optionalField("lactationRoom", item.lactationroom),
  };
}

function normalizeTourApiItems<TItem>(
  items: TourApiItemsDto<TItem> | "" | null | undefined,
): TItem[] {
  if (items === undefined || items === null || items === "") {
    return [];
  }

  const item = items.item;

  if (item === undefined || item === null) {
    return [];
  }

  return normalizeItem(item);
}

function normalizeItem<TItem>(item: TourApiItemDto<TItem>): TItem[] {
  return Array.isArray(item) ? item : [item];
}

function mapSearchKeywordItemToDestinationCandidate(
  item: SearchKeywordItemDto,
  keyword: string,
): DestinationCandidate | undefined {
  const contentId = normalizeText(item.contentid);
  const contentTypeId = normalizeText(item.contenttypeid);
  const name = normalizeText(item.title);
  const longitude = parseCoordinate(item.mapx, -180, 180);
  const latitude = parseCoordinate(item.mapy, -90, 90);

  if (
    contentId === undefined ||
    contentTypeId === undefined ||
    name === undefined ||
    longitude === undefined ||
    latitude === undefined
  ) {
    return undefined;
  }

  const normalizedKeyword = normalizeDestinationName(keyword);
  const normalizedName = normalizeDestinationName(name);
  const address = joinAddress(item.addr1, item.addr2);
  const imageUrl = normalizeText(item.firstimage) ?? normalizeText(item.firstimage2);

  return {
    name,
    contentId,
    contentTypeId,
    ...(address !== undefined ? { address } : {}),
    ...(imageUrl !== undefined ? { imageUrl } : {}),
    coordinates: {
      latitude,
      longitude,
    },
    normalizedName,
    matchType: normalizedName === normalizedKeyword ? "EXACT" : "PARTIAL",
  };
}

function normalizeText(value: string | null | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function optionalField(
  key: keyof AccessibilitySourceData,
  value: string | null | undefined,
): Partial<AccessibilitySourceData> {
  const normalizedValue = normalizeAccessibilityDescription(value);

  if (normalizedValue === undefined) {
    return {};
  }

  return { [key]: normalizedValue };
}

function normalizeAccessibilityDescription(value: string | null | undefined): string | undefined {
  const normalizedValue = normalizeText(value);
  if (normalizedValue === undefined) return undefined;

  const plainText = decodeHtmlEntities(normalizedValue)
    .replaceAll(/<!--[\s\S]*?-->/g, " ")
    .replaceAll(/<\s*br\b[^>]*>/gi, "\n")
    .replaceAll(/<\s*\/?\s*(?:p|div|li|ul|ol|section|article)\b[^>]*>/gi, "\n")
    .replaceAll(/<\s*\/?\s*[a-z][^>]*>/gi, "")
    .replaceAll(/\r\n?/g, "\n");
  const sections = plainText
    .split(/\n+/)
    .map((section) => section.replaceAll(/\s+/g, " ").trim())
    .filter((section) => section.length > 0);
  return sections.length > 0 ? sections.join(" · ") : undefined;
}

function decodeHtmlEntities(value: string): string {
  const withNamedEntities = value.replaceAll(
    /&(nbsp|amp|lt|gt|quot|apos|middot|bull);/gi,
    (entity, name: string) => namedHtmlEntities[name.toLowerCase()] ?? entity,
  );
  return withNamedEntities.replaceAll(
    /&#(?:x([0-9a-f]+)|(\d+));?/gi,
    (entity, hexadecimal: string | undefined, decimal: string | undefined) => {
      const digits = hexadecimal ?? decimal;
      if (digits === undefined) return entity;
      const codePoint = Number.parseInt(digits, hexadecimal === undefined ? 10 : 16);
      if (!isValidUnicodeCodePoint(codePoint)) return entity;
      return String.fromCodePoint(codePoint);
    },
  );
}

function isValidUnicodeCodePoint(value: number): boolean {
  return (
    Number.isInteger(value) && value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff)
  );
}

function parseCoordinate(
  value: string | null | undefined,
  min: number,
  max: number,
): number | undefined {
  const normalizedValue = normalizeText(value);

  if (normalizedValue === undefined) {
    return undefined;
  }

  const coordinate = Number(normalizedValue);

  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    return undefined;
  }

  return coordinate;
}

function joinAddress(
  addr1: string | null | undefined,
  addr2: string | null | undefined,
): string | undefined {
  const addressParts = [normalizeText(addr1), normalizeText(addr2)].filter(
    (part): part is string => part !== undefined,
  );

  if (addressParts.length === 0) {
    return undefined;
  }

  return addressParts.join(" ");
}

function normalizeDestinationName(value: string): string {
  return value.trim().replaceAll(/\s+/g, "").toLowerCase();
}
