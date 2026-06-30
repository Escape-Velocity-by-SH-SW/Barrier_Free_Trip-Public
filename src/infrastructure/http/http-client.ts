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

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl;
    this.defaultHeaders = options.defaultHeaders;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? defaultTimeoutMs;
    this.fetchFn = options.fetchFn ?? fetch;
  }

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

  private mergeHeaders(headers?: RequestInit["headers"]): Headers {
    const mergedHeaders = new Headers(this.defaultHeaders);

    if (headers !== undefined) {
      new Headers(headers).forEach((value, key) => {
        mergedHeaders.set(key, value);
      });
    }

    return mergedHeaders;
  }

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

  private createStatusError(response: Response): HttpRequestError {
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("retry-after"));

    return new HttpRequestError({
      kind: getHttpErrorKind(response.status),
      message: "HTTP request failed with a non-success status.",
      status: response.status,
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    });
  }

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
