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
  const name = normalizeText(row["축제명"]);

  if (name === undefined) {
    return undefined;
  }

  const venue = normalizeText(row["개최장소"]);
  const roadAddress = normalizeText(row["소재지도로명주소"]);
  const lotAddress = normalizeText(row["소재지지번주소"]);
  const startDate = normalizeText(row["축제시작일자"]);
  const endDate = normalizeText(row["축제종료일자"]);
  const latitude = parseCoordinate(row["위도"], -90, 90);
  const longitude = parseCoordinate(row["경도"], -180, 180);
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
    ...optionalField("phoneNumber", row["전화번호"]),
    ...optionalField("referenceDate", row["데이터기준일자"]),
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
