import type { DestinationCandidate } from "../../domain/destination.js";
import { normalizeDestinationName } from "../../domain/destination-name.js";
import type {
  SearchKeywordItemDto,
  SearchKeywordResponseDto,
  TourApiItemDto,
  TourApiItemsDto,
} from "./korea-tour-api.dto.js";

export function mapSearchKeywordResponseToDestinationCandidates(
  response: SearchKeywordResponseDto,
  keyword: string,
): DestinationCandidate[] {
  return normalizeTourApiItems(response.response?.body?.items)
    .map((item) => mapSearchKeywordItemToDestinationCandidate(item, keyword))
    .filter((candidate): candidate is DestinationCandidate => candidate !== undefined);
}

function normalizeTourApiItems(
  items: TourApiItemsDto<SearchKeywordItemDto> | "" | null | undefined,
): SearchKeywordItemDto[] {
  if (items === undefined || items === null || items === "") {
    return [];
  }

  const item = items.item;

  if (item === undefined || item === null) {
    return [];
  }

  return normalizeItem(item);
}

function normalizeItem(item: TourApiItemDto<SearchKeywordItemDto>): SearchKeywordItemDto[] {
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

  return {
    name,
    contentId,
    contentTypeId,
    ...(address !== undefined ? { address } : {}),
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
