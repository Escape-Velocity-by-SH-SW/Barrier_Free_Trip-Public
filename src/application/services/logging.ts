export function toLoggableError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: sanitizeLogMessage(error.message),
      ...(getOptionalProperty(error, "kind") !== undefined
        ? { kind: getOptionalProperty(error, "kind") }
        : {}),
      ...(getOptionalProperty(error, "status") !== undefined
        ? { status: getOptionalProperty(error, "status") }
        : {}),
      ...(getOptionalProperty(error, "retryAfterSeconds") !== undefined
        ? { retryAfterSeconds: getOptionalProperty(error, "retryAfterSeconds") }
        : {}),
    };
  }

  return {
    name: "UnknownError",
    message: "Unknown error",
  };
}

export type StructuredLogLevel = "info" | "warn" | "error";

export interface StructuredLogEvent {
  readonly timestamp: string;
  readonly level: StructuredLogLevel;
  readonly event: string;
  readonly requestId?: string;
  readonly tool?: string;
  readonly source?: string;
  readonly [key: string]: unknown;
}

export type StructuredLogWriter = (event: StructuredLogEvent) => void;

/** 짧고 안전한 필드만 받아 한 줄 NDJSON을 stderr에 기록한다. */
export const writeStructuredLog: StructuredLogWriter = (event) => {
  console.error(JSON.stringify(event));
};

export function createStructuredLogEvent(
  level: StructuredLogLevel,
  event: string,
  fields: Omit<StructuredLogEvent, "timestamp" | "level" | "event"> = {},
  now: () => Date = () => new Date(),
): StructuredLogEvent {
  return {
    timestamp: now().toISOString(),
    level,
    event,
    ...fields,
  };
}

/** 로그에는 오류 이름과 메시지만 남기고 stack, 요청 payload, 인증정보는 제외한다. */
export function toSafeErrorFields(error: unknown): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: sanitizeLogMessage(error.message),
    };
  }

  return {
    errorName: "UnknownError",
    errorMessage: "Unknown error",
  };
}

export function sanitizeLogMessage(message: string): string {
  return message
    .replaceAll(/https?:\/\/\S+/gi, "[REDACTED_URL]")
    .replaceAll(/\b(serviceKey|apiKey|authorization)\s*[=:]\s*[^\s&,]+/gi, "$1=[REDACTED]")
    .replaceAll(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .slice(0, 300);
}

function getOptionalProperty(value: object, property: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, property)
    ? (value as Record<string, unknown>)[property]
    : undefined;
}
