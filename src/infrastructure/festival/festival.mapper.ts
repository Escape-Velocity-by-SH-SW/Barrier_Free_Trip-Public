import type { FestivalSourceData } from "../../domain/festival.js";
import type { FestivalResponseDto, FestivalRowDto } from "./festival.dto.js";

export function mapFestivalResponseToSourceData(
  response: FestivalResponseDto,
): FestivalSourceData[] {
  return (response.data ?? [])
    .map(mapFestivalRowToSourceData)
    .filter((festival): festival is FestivalSourceData => festival !== undefined);
}

function mapFestivalRowToSourceData(row: FestivalRowDto): FestivalSourceData | undefined {
  const name = firstText(row["축제명"], row.fstvlNm);

  if (name === undefined) {
    return undefined;
  }

  const venue = firstText(row["개최장소"], row.opar);
  const roadAddress = firstText(row["소재지도로명주소"], row.rdnmadr);
  const lotAddress = firstText(row["소재지지번주소"], row.lnmadr);
  const startDate = firstText(row["축제시작일자"], row.fstvlStartDate);
  const endDate = firstText(row["축제종료일자"], row.fstvlEndDate);
  const latitude = parseCoordinate(firstText(row["위도"], row.latitude), -90, 90);
  const longitude = parseCoordinate(firstText(row["경도"], row.longitude), -180, 180);
  const address = roadAddress ?? lotAddress;

  return {
    id: createFestivalId(name, startDate, venue, address),
    name,
    ...(venue !== undefined ? { venue } : {}),
    ...(address !== undefined ? { address } : {}),
    ...(startDate !== undefined ? { startDate } : {}),
    ...(endDate !== undefined ? { endDate } : {}),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
    ...optionalField("phoneNumber", firstText(row["전화번호"], row.phoneNumber)),
    ...optionalField("referenceDate", firstText(row["데이터기준일자"], row.referenceDate)),
  };
}

function optionalField(
  key: "phoneNumber" | "referenceDate",
  value: string | null | undefined,
): Partial<Pick<FestivalSourceData, "phoneNumber" | "referenceDate">> {
  const normalizedValue = normalizeText(value);

  if (normalizedValue === undefined) {
    return {};
  }

  return { [key]: normalizedValue };
}

function normalizeText(value: string | number | null | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmedValue = String(value).trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function firstText(
  first: string | number | null | undefined,
  second: string | number | null | undefined,
): string | undefined {
  return normalizeText(first) ?? normalizeText(second);
}

function parseCoordinate(
  value: string | number | null | undefined,
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

function createFestivalId(
  name: string,
  startDate: string | undefined,
  venue: string | undefined,
  address: string | undefined,
): string {
  return [name, startDate, venue, address]
    .filter((part): part is string => part !== undefined)
    .join("|");
}
