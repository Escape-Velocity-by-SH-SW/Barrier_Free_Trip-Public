export interface KmaForecastBaseTime {
  baseDate: string;
  baseTime: string;
}

const KOREA_TIME_ZONE = "Asia/Seoul";
const FORECAST_DELAY_MINUTES = 10;
const SHORT_TERM_FORECAST_BASE_TIMES = [
  { hour: 2, baseTime: "0200" },
  { hour: 5, baseTime: "0500" },
  { hour: 8, baseTime: "0800" },
  { hour: 11, baseTime: "1100" },
  { hour: 14, baseTime: "1400" },
  { hour: 17, baseTime: "1700" },
  { hour: 20, baseTime: "2000" },
  { hour: 23, baseTime: "2300" },
] as const;

/** 현재 시각을 KST로 해석해 단기예보 API에서 조회 가능한 최신 base_date/base_time을 고른다. */
export function resolveKmaForecastBaseTime(now: Date): KmaForecastBaseTime {
  const koreaTime = toKoreaTimeParts(now);
  const baseTime = resolveAvailableBaseTime(koreaTime);

  return {
    baseDate: baseTime.usePreviousDate
      ? formatPreviousKmaBaseDate(now)
      : formatKmaBaseDate(koreaTime),
    baseTime: baseTime.value,
  };
}

interface KoreaTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

interface ResolvedBaseTime {
  value: (typeof SHORT_TERM_FORECAST_BASE_TIMES)[number]["baseTime"];
  usePreviousDate: boolean;
}

/** KST 시각이 속한 구간에 따라 오늘 또는 전날의 발표 기준시각을 선택한다. */
function resolveAvailableBaseTime(parts: KoreaTimeParts): ResolvedBaseTime {
  const currentMinutes = parts.hour * 60 + parts.minute;

  for (let index = SHORT_TERM_FORECAST_BASE_TIMES.length - 1; index >= 0; index -= 1) {
    const candidate = SHORT_TERM_FORECAST_BASE_TIMES[index];

    if (candidate === undefined) {
      continue;
    }

    const availableMinutes = candidate.hour * 60 + FORECAST_DELAY_MINUTES;

    if (currentMinutes >= availableMinutes) {
      return {
        value: candidate.baseTime,
        usePreviousDate: false,
      };
    }
  }

  return {
    value: "2300",
    usePreviousDate: true,
  };
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

/** 00:00~02:09 KST 구간에서 사용할 전날 baseDate를 계산한다. */
function formatPreviousKmaBaseDate(date: Date): string {
  const previousDate = new Date(date.getTime() - 24 * 60 * 60 * 1000);
  return formatKmaBaseDate(toKoreaTimeParts(previousDate));
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
