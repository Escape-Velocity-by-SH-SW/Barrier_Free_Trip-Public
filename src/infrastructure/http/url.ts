export type HttpQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly (string | number | boolean | null | undefined)[];

export type HttpQueryParams = Readonly<Record<string, HttpQueryValue>>;
type HttpQueryValueArray = readonly (string | number | boolean | null | undefined)[];

export function buildUrl(baseUrl: string, path: string, query?: HttpQueryParams): URL {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, normalizedBaseUrl);

  if (query === undefined) {
    return url;
  }

  for (const [key, value] of Object.entries(query)) {
    appendQueryValue(url.searchParams, key, value);
  }

  return url;
}

function appendQueryValue(
  searchParams: URLSearchParams,
  key: string,
  value: HttpQueryValue,
): void {
  if (value === undefined || value === null) {
    return;
  }

  if (isHttpQueryValueArray(value)) {
    for (const item of value) {
      appendQueryValue(searchParams, key, item);
    }
    return;
  }

  searchParams.append(key, String(value));
}

function isHttpQueryValueArray(value: HttpQueryValue): value is HttpQueryValueArray {
  return Array.isArray(value);
}
