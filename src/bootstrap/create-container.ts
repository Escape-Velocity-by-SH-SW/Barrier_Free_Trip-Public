import { AccessibilityService } from "../application/services/accessibility.service.js";
import { ChargerService } from "../application/services/charger.service.js";
import { DestinationResolver } from "../application/services/destination-resolver.js";
import { FestivalRiskService } from "../application/services/festival-risk.service.js";
import { WheelChairChargerApiClient } from "../infrastructure/charger/wheelchair-charger-api.client.js";
import { WheelChairChargerAdapter } from "../infrastructure/charger/wheelchair-charger.adapter.js";
import { FestivalAdapter } from "../infrastructure/festival/festival.adapter.js";
import { FestivalApiClient } from "../infrastructure/festival/festival-api.client.js";
import { FetchHttpClient } from "../infrastructure/http/http-client.js";
import { KoreaTourAccessibilityAdapter } from "../infrastructure/tourism/korea-tour-accessibility.adapter.js";
import { KoreaTourApiClient } from "../infrastructure/tourism/korea-tour-api.client.js";

const defaultExternalApiTimeoutMs = 2_500;

export interface AppContainer {
  readonly services: {
    readonly chargerService: ChargerService;
    readonly destinationResolver: DestinationResolver;
    readonly accessibilityService: AccessibilityService;
    readonly festivalRiskService: FestivalRiskService;
  };
}

export function createContainer(env: NodeJS.ProcessEnv = process.env): AppContainer {
  const tourismServices = createTourismServices(env);

  return {
    services: {
      chargerService: createChargerService(env),
      destinationResolver: tourismServices.destinationResolver,
      accessibilityService: tourismServices.accessibilityService,
      festivalRiskService: createFestivalRiskService(env),
    },
  };
}

function createTourismServices(env: NodeJS.ProcessEnv): {
  readonly destinationResolver: DestinationResolver;
  readonly accessibilityService: AccessibilityService;
} {
  const httpClient = createHttpClient({
    baseUrl: getRequiredEnv(env, "TOUR_API_BASE_URL"),
    ...optionalNumberProperty(
      "timeoutMs",
      getOptionalPositiveIntegerEnv(env, "TOUR_API_TIMEOUT_MS") ?? defaultExternalApiTimeoutMs,
    ),
  });
  const apiClient = new KoreaTourApiClient(httpClient, {
    serviceKey: getRequiredEnv(env, "TOUR_API_SERVICE_KEY"),
    mobileOs: getOptionalEnv(env, "TOUR_API_MOBILE_OS") ?? "ETC",
    mobileApp: getOptionalEnv(env, "TOUR_API_MOBILE_APP") ?? "BarrierFreeTrip",
    ...optionalNumberProperty(
      "defaultNumOfRows",
      getOptionalPositiveIntegerEnv(env, "TOUR_API_DEFAULT_NUM_OF_ROWS"),
    ),
  });
  const repository = new KoreaTourAccessibilityAdapter(apiClient);

  return {
    destinationResolver: new DestinationResolver(repository),
    accessibilityService: new AccessibilityService(repository),
  };
}

function createChargerService(env: NodeJS.ProcessEnv): ChargerService {
  const httpClient = createHttpClient({
    baseUrl: getRequiredEnv(env, "WHEELCHAIR_CHARGER_API_BASE_URL"),
    timeoutMs: getRequiredPositiveIntegerEnv(env, "WHEELCHAIR_CHARGER_API_TIMEOUT_MS"),
  });
  const apiClient = new WheelChairChargerApiClient(httpClient, {
    endpointUrl: getRequiredEnv(env, "WHEELCHAIR_CHARGER_API_ENDPOINT_PATH"),
    serviceKey: getRequiredEnv(env, "WHEELCHAIR_CHARGER_API_SERVICE_KEY"),
  });
  const repository = new WheelChairChargerAdapter(apiClient);

  return new ChargerService(repository);
}

function createFestivalRiskService(env: NodeJS.ProcessEnv): FestivalRiskService {
  const httpClient = createHttpClient({
    baseUrl: getRequiredEnv(env, "FESTIVAL_API_BASE_URL"),
    ...optionalNumberProperty(
      "timeoutMs",
      getOptionalPositiveIntegerEnv(env, "FESTIVAL_API_TIMEOUT_MS") ?? defaultExternalApiTimeoutMs,
    ),
  });
  const apiClient = new FestivalApiClient(httpClient, {
    path: getOptionalEnv(env, "FESTIVAL_API_ENDPOINT_PATH") ?? "",
    serviceKey: getRequiredEnv(env, "FESTIVAL_API_SERVICE_KEY"),
    ...optionalNumberProperty(
      "defaultPerPage",
      getOptionalPositiveIntegerEnv(env, "FESTIVAL_API_DEFAULT_PER_PAGE"),
    ),
    ...optionalNumberProperty(
      "fullScanPageSize",
      getOptionalPositiveIntegerEnv(env, "FESTIVAL_API_FULL_SCAN_PAGE_SIZE"),
    ),
    ...optionalNumberProperty(
      "focusedPerPage",
      getOptionalPositiveIntegerEnv(env, "FESTIVAL_API_FOCUSED_PER_PAGE"),
    ),
  });
  const repository = new FestivalAdapter(apiClient);

  return new FestivalRiskService(repository);
}

function getRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = getOptionalEnv(env, name);

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getRequiredPositiveIntegerEnv(env: NodeJS.ProcessEnv, name: string): number {
  const value = getRequiredEnv(env, name);
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }

  return parsedValue;
}

function getOptionalPositiveIntegerEnv(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const value = getOptionalEnv(env, name);

  if (value === undefined) {
    return undefined;
  }

  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer.`);
  }

  return parsedValue;
}

function getOptionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
}

function optionalNumberProperty<TKey extends string>(
  key: TKey,
  value: number | undefined,
): Partial<Record<TKey, number>> {
  return value !== undefined ? ({ [key]: value } as Record<TKey, number>) : {};
}

function createHttpClient(options: {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
}): FetchHttpClient {
  return new FetchHttpClient({
    baseUrl: options.baseUrl,
    ...(options.timeoutMs !== undefined ? { defaultTimeoutMs: options.timeoutMs } : {}),
  });
}
