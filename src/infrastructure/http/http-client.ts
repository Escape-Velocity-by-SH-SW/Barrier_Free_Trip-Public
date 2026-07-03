import { HttpRequestError, getHttpErrorKind } from "./http-error.js";
import { buildUrl, type HttpQueryParams } from "./url.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpClient {
  requestJson<TResponse = unknown>(options: HttpRequestOptions): Promise<TResponse>;
}

export interface HttpClientOptions {
  baseUrl: string;
  defaultHeaders?: RequestInit["headers"];
  defaultTimeoutMs?: number;
  fetchFn?: typeof fetch;
}

export interface HttpRequestOptions {
  path: string;
  method?: HttpMethod;
  query?: HttpQueryParams;
  headers?: RequestInit["headers"];
  body?: RequestInit["body"];
  timeoutMs?: number;
  signal?: AbortSignal;
}

const defaultTimeoutMs = 10_000;

export class FetchHttpClient implements HttpClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: RequestInit["headers"] | undefined;
  private readonly defaultTimeoutMs: number;
  private readonly fetchFn: typeof fetch;

  /** 클라이언트를 초기화한다 (기본 URL, 기본 헤더, 기본 타임아웃, fetch 구현체 설정). */
  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl;
    this.defaultHeaders = options.defaultHeaders;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? defaultTimeoutMs;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /** HTTP 요청을 수행하고 응답 본문을 JSON으로 파싱해 반환한다 (204는 undefined, 파싱 실패는 에러로 처리). */
  async requestJson<TResponse = unknown>(options: HttpRequestOptions): Promise<TResponse> {
    const response = await this.request(options);

    if (response.status === 204) {
      return undefined as TResponse;
    }

    try {
      return (await response.json()) as TResponse;
    } catch (error) {
      throw new HttpRequestError({
        kind: "INVALID_RESPONSE",
        message: "HTTP response body was not valid JSON.",
        status: response.status,
        cause: error,
      });
    }
  }

  /** URL을 구성하고 타임아웃/abort를 연결한 뒤 실제 fetch를 실행하며, 실패 시 HttpRequestError로 정규화한다. */
  private async request(options: HttpRequestOptions): Promise<Response> {
    const url = buildUrl(this.baseUrl, options.path, options.query);
    const abortController = new AbortController();
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      if (abortController.signal.aborted) {
        return;
      }

      timedOut = true;
      abortController.abort();
    }, timeoutMs);
    const removeAbortListener = this.forwardAbortSignal(options.signal, abortController);

    try {
      const requestInit: RequestInit = {
        method: options.method ?? "GET",
        headers: this.mergeHeaders(options.headers),
        signal: abortController.signal,
        ...(options.body !== undefined ? { body: options.body } : {}),
      };
      const response = await this.fetchFn(url, {
        ...requestInit,
      });

      if (!response.ok) {
        throw this.createStatusError(response);
      }

      return response;
    } catch (error) {
      throw this.normalizeRequestError(error, timedOut);
    } finally {
      clearTimeout(timeoutId);
      removeAbortListener();
    }
  }

  /** 인스턴스 기본 헤더에 요청별 헤더를 병합한다 (요청별 헤더가 우선). */
  private mergeHeaders(headers?: RequestInit["headers"]): Headers {
    const mergedHeaders = new Headers(this.defaultHeaders);

    if (headers !== undefined) {
      new Headers(headers).forEach((value, key) => {
        mergedHeaders.set(key, value);
      });
    }

    return mergedHeaders;
  }

  /** 외부에서 전달된 AbortSignal을 내부(타임아웃용) AbortController에 연결하고, 해제용 콜백을 반환한다. */
  private forwardAbortSignal(
    sourceSignal: AbortSignal | undefined,
    abortController: AbortController,
  ): () => void {
    if (sourceSignal === undefined) {
      return () => undefined;
    }

    const abort = (): void => abortController.abort(sourceSignal.reason);

    if (sourceSignal.aborted) {
      abort();
      return () => undefined;
    }

    sourceSignal.addEventListener("abort", abort, { once: true });
    return () => sourceSignal.removeEventListener("abort", abort);
  }

  /** 실패(non-OK) 응답으로부터 Retry-After 정보를 포함한 HttpRequestError를 생성한다. */
  private createStatusError(response: Response): HttpRequestError {
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));

    return new HttpRequestError({
      kind: getHttpErrorKind(response.status),
      message: "HTTP request failed with a non-success status.",
      status: response.status,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    });
  }

  /** 캐치된 에러를 (이미 HttpRequestError인 경우 / 타임아웃 abort인 경우 / 그 외 네트워크 에러인 경우로 구분하여) HttpRequestError로 정규화한다. */
  private normalizeRequestError(error: unknown, wasTimedOut: boolean): Error {
    if (error instanceof HttpRequestError) {
      return error;
    }

    if (wasTimedOut) {
      return new HttpRequestError({
        kind: "TIMEOUT",
        message: "HTTP request timed out.",
        cause: error,
      });
    }

    return new HttpRequestError({
      kind: "NETWORK_ERROR",
      message: "HTTP request failed before receiving a response.",
      cause: error,
    });
  }
}

/** Retry-After 헤더 값(초 단위 delta 또는 HTTP-date)을 파싱해 대기해야 할 초 단위 값으로 변환한다. */
function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isInteger(seconds) && seconds >= 0) {
    return seconds;
  }

  const retryAt = Date.parse(value);

  if (Number.isNaN(retryAt)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000));
}
