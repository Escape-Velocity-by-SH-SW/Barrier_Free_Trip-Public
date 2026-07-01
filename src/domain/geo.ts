import type { Coordinates } from "./destination.js";

const earthRadiusKm = 6371;

export function calculateDistanceKm(from: Coordinates, to: Coordinates): number {
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
