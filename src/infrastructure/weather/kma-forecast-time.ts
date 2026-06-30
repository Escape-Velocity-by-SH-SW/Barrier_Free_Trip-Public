export interface KmaForecastBaseTime {
  baseDate: string;
  baseTime: string;
}

const KOREA_TIME_ZONE = "Asia/Seoul";
const FORECAST_AVAILABLE_MINUTE = 45;

export function resolveKmaForecastBaseTime(now: Date = new Date()): KmaForecastBaseTime {
  const koreaTime = toKoreaTimeParts(now);
  const baseDateTime =
    koreaTime.minute >= FORECAST_AVAILABLE_MINUTE
      ? now
      : new Date(now.getTime() - 60 * 60 * 1000);
  const baseTimeParts = toKoreaTimeParts(baseDateTime);

  return {
    baseDate: formatKmaBaseDate(baseTimeParts),
    baseTime: `${pad2(baseTimeParts.hour)}30`,
  };
}

interface KoreaTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function toKoreaTimeParts(date: Date): KoreaTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    year: getDatePart(parts, "year"),
    month: getDatePart(parts, "month"),
    day: getDatePart(parts, "day"),
    hour: getDatePart(parts, "hour"),
    minute: getDatePart(parts, "minute"),
  };
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const part = parts.find((item) => item.type === type);

  if (part === undefined) {
    throw new Error(`Missing ${type} in formatted Korea time`);
  }

  return Number(part.value);
}

function formatKmaBaseDate(parts: KoreaTimeParts): string {
  return `${parts.year}${pad2(parts.month)}${pad2(parts.day)}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
