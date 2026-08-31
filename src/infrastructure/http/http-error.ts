export type HttpErrorKind =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "INVALID_RESPONSE"
  | "UNKNOWN";

export interface HttpRequestErrorDetails {
  kind: HttpErrorKind;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class HttpRequestError extends Error {
  readonly kind: HttpErrorKind;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(details: HttpRequestErrorDetails) {
    super(details.message, { cause: details.cause });
    this.name = "HttpRequestError";
    this.kind = details.kind;

    if (details.status !== undefined) {
      this.status = details.status;
    }

    if (details.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = details.retryAfterSeconds;
    }
  }
}

export function getHttpErrorKind(status: number): HttpErrorKind {
  if (status === 400) {
    return "BAD_REQUEST";
  }

  if (status === 401) {
    return "UNAUTHORIZED";
  }

  if (status === 403) {
    return "FORBIDDEN";
  }

  if (status === 404) {
    return "NOT_FOUND";
  }

  if (status === 408) {
    return "TIMEOUT";
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }

  if (status >= 500 && status <= 599) {
    return "SERVER_ERROR";
  }

  return "UNKNOWN";
}

export function isRetryableHttpError(error: HttpRequestError): boolean {
  return (
    error.kind === "TIMEOUT" ||
    error.kind === "NETWORK_ERROR" ||
    error.kind === "RATE_LIMITED" ||
    error.kind === "SERVER_ERROR"
  );
}
