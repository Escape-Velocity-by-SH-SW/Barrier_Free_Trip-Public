import { normalize } from "path";
import type { ChargerSourceData } from "../../domain/charger.js";
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
  //const normalizedValue = normalizeText(value);
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
