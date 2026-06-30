export function normalizeDestinationName(value: string): string {
  return value.trim().replaceAll(/\s+/g, "").toLowerCase();
}
