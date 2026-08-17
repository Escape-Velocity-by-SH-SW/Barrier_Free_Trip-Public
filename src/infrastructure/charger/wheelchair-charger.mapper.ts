import type { ChargerOperatingHours, ChargerSourceData } from "../../domain/charger.js";
import type { WheelchairChargerItemDto } from "./wheelchair-charger.dto.js";

export function mapWheelchairChargerItems(
  items: readonly WheelchairChargerItemDto[],
): ChargerSourceData[] {
  const chargers: ChargerSourceData[] = [];

  for (const item of items) {
    const charger = mapWheelchairChargerItem(item);

    if (charger !== undefined) {
      chargers.push(charger);
    }
  }

  return chargers;
}

export function mapWheelchairChargerItem(
  item: WheelchairChargerItemDto,
): ChargerSourceData | undefined {
  const name = normalizeText(item.fcltyNm);

  if (name === undefined) {
    return undefined;
  }

  const address = normalizeText(item.rdnmadr) ?? normalizeText(item.lnmadr);
  const installationLocationDescription = normalizeText(item.instlLcDesc);
  const latitude = parseCoordinate(item.latitude, { min: -90, max: 90 });
  const longitude = parseCoordinate(item.longitude, { min: -180, max: 180 });
  const phoneNumber = normalizeText(item.institutionPhoneNumber);
  const managingOrganization = normalizeText(item.institutionNm);
  const referenceDate = normalizeText(item.referenceDate);
  const operatingHours = mapOperatingHours(item);

  return {
    name,
    ...(address !== undefined ? { address } : {}),
    ...(installationLocationDescription !== undefined
      ? { installationLocationDescription }
      : {}),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
    ...(phoneNumber !== undefined ? { phoneNumber } : {}),
    ...(managingOrganization !== undefined ? { managingOrganization } : {}),
    ...(referenceDate !== undefined ? { referenceDate } : {}),
    ...(operatingHours !== undefined ? { operatingHours } : {}),
  };
}

// TODO: 아래 raw 필드 키(wkdayOperBeginTime 등)는 실제 API 응답 샘플로 아직 검증되지 않았다.
// 전국전동휠체어급속충전기표준데이터(data.go.kr, id 15034533)의 평일/토요일/공휴일
// 운영시작·종료시각 컬럼을 매핑하려는 시도이며, 키가 다르면 해당 필드는 그냥 undefined로
// 빠지므로(다른 optional 필드와 동일한 안전망) 파이프라인은 깨지지 않는다.
// 실제 응답을 1회 확인해 키를 맞춰야 한다.
function mapOperatingHours(item: WheelchairChargerItemDto): ChargerOperatingHours | undefined {
  const weekdayStart = normalizeText(item.wkdayOperBeginTime);
  const weekdayEnd = normalizeText(item.wkdayOperEndTime);
  const saturdayStart = normalizeText(item.satOperBeginTime);
  const saturdayEnd = normalizeText(item.satOperEndTime);
  const holidayStart = normalizeText(item.holidayOperBeginTime);
  const holidayEnd = normalizeText(item.holidayOperEndTime);

  if (
    weekdayStart === undefined &&
    weekdayEnd === undefined &&
    saturdayStart === undefined &&
    saturdayEnd === undefined &&
    holidayStart === undefined &&
    holidayEnd === undefined
  ) {
    return undefined;
  }

  return {
    ...(weekdayStart !== undefined ? { weekdayStart } : {}),
    ...(weekdayEnd !== undefined ? { weekdayEnd } : {}),
    ...(saturdayStart !== undefined ? { saturdayStart } : {}),
    ...(saturdayEnd !== undefined ? { saturdayEnd } : {}),
    ...(holidayStart !== undefined ? { holidayStart } : {}),
    ...(holidayEnd !== undefined ? { holidayEnd } : {}),
  };
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseCoordinate(
  value: unknown,
  range: { readonly min: number; readonly max: number },
): number | undefined {
  const normalizedValue = typeof value == "number" ? value : normalizeText(value);

  if (normalizedValue === undefined) {
    return undefined;
  }

  const coordinate = Number(normalizedValue);

  if (!Number.isFinite(coordinate)) {
    return undefined;
  }

  if (coordinate < range.min || coordinate > range.max) {
    return undefined;
  }

  return coordinate;
}
