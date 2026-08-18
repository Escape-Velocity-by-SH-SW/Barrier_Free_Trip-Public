import { AccessibilityService } from "../application/services/accessibility.service.js";
import { ChargerService } from "../application/services/charger.service.js";
import { DestinationAccessibilityToolService } from "../application/services/destination-accessibility-tool.service.js";
import { DestinationEventRiskToolService } from "../application/services/destination-event-risk-tool.service.js";
import { DestinationResolver } from "../application/services/destination-resolver.js";
import { DestinationWeatherToolService } from "../application/services/destination-weather-tool.service.js";
import { FestivalRiskService } from "../application/services/festival-risk.service.js";
import { NearbyWheelchairChargersToolService } from "../application/services/nearby-wheelchair-chargers-tool.service.js";
import { VisitAssessmentService } from "../application/services/visit-assessment.service.js";
import { WeatherService } from "../application/services/weather.service.js";
import { WheelChairChargerApiClient } from "../infrastructure/charger/wheelchair-charger-api.client.js";
import { WheelChairChargerAdapter } from "../infrastructure/charger/wheelchair-charger.adapter.js";
import { FestivalAdapter } from "../infrastructure/festival/festival.adapter.js";
import { FestivalApiClient } from "../infrastructure/festival/festival-api.client.js";
import { FetchHttpClient } from "../infrastructure/http/http-client.js";
import { KoreaTourAccessibilityAdapter } from "../infrastructure/tourism/korea-tour-accessibility.adapter.js";
import { KoreaTourApiClient } from "../infrastructure/tourism/korea-tour-api.client.js";
import { KmaWeatherApiClient } from "../infrastructure/weather/kma-weather-api.client.js";
import { KmaWeatherAdapter } from "../infrastructure/weather/kma-weather.adapter.js";
import type { DownstreamSource } from "../application/ports/operation-context.js";
import { performanceConfig } from "../application/services/performance-config.js";

const WHEELCHAIR_CHARGER_API_ENDPOINT_PATH = "/tn_pubr_public_electr_whlchairhgh_spdchrgr_api";
const KMA_WEATHER_API_ENDPOINT_PATH = "/getVilageFcst";
const TOUR_API_MOBILE_OS = "ETC";
const TOUR_API_MOBILE_APP = "BarrierFreeTrip";
const TOUR_API_DEFAULT_NUM_OF_ROWS = 10;
const FESTIVAL_API_ENDPOINT_PATH = "/openapi/tn_pubr_public_cltur_fstvl_api";
const FESTIVAL_API_DEFAULT_PER_PAGE = 1_000;

export interface AppContainer {
  readonly services: {
    readonly chargerService: ChargerService;
    readonly weatherService: WeatherService;
    readonly destinationResolver: DestinationResolver;
    readonly accessibilityService: AccessibilityService;
    readonly festivalRiskService: FestivalRiskService;
    readonly visitAssessmentService: VisitAssessmentService;
    readonly destinationWeatherToolService: DestinationWeatherToolService;
    readonly nearbyWheelchairChargersToolService: NearbyWheelchairChargersToolService;
    readonly destinationAccessibilityToolService: DestinationAccessibilityToolService;
    readonly destinationEventRiskToolService: DestinationEventRiskToolService;
  };
}

export function createContainer(env: NodeJS.ProcessEnv = process.env): AppContainer {
  const tourismServices = createTourismServices(env);
  const chargerService = createChargerService(env);
  const weatherService = createWeatherService(env);
  const festivalRiskService = createFestivalRiskService(env);

  return {
    services: {
      chargerService,
      weatherService,
      destinationResolver: tourismServices.destinationResolver,
      accessibilityService: tourismServices.accessibilityService,
      festivalRiskService,
      visitAssessmentService: new VisitAssessmentService(
        tourismServices.destinationResolver,
        tourismServices.accessibilityService,
        weatherService,
        chargerService,
        festivalRiskService,
        {
          overallDeadlineMs: performanceConfig.overallDeadlineMs,
          destinationConcurrency: performanceConfig.destinationConcurrency,
          responseReserveMs: performanceConfig.responseReserveMs,
          maxSourceBudgetMs: performanceConfig.maxSourceBudgetMs,
        },
      ),
      destinationWeatherToolService: new DestinationWeatherToolService(
        tourismServices.destinationResolver,
        weatherService,
      ),
      nearbyWheelchairChargersToolService: new NearbyWheelchairChargersToolService(
        tourismServices.destinationResolver,
        chargerService,
      ),
      destinationAccessibilityToolService: new DestinationAccessibilityToolService(
        tourismServices.destinationResolver,
        tourismServices.accessibilityService,
      ),
      destinationEventRiskToolService: new DestinationEventRiskToolService(
        tourismServices.destinationResolver,
        festivalRiskService,
      ),
    },
  };
}

function createTourismServices(env: NodeJS.ProcessEnv): {
  readonly destinationResolver: DestinationResolver;
  readonly accessibilityService: AccessibilityService;
} {
  const httpClient = createHttpClient({
    baseUrl: getRequiredEnv(env, "TOUR_API_BASE_URL"),
    source: "tourism",
  });
  const apiClient = new KoreaTourApiClient(httpClient, {
    serviceKey: getRequiredEnv(env, "TOUR_API_SERVICE_KEY"),
    mobileOs: TOUR_API_MOBILE_OS,
    mobileApp: TOUR_API_MOBILE_APP,
    defaultNumOfRows: TOUR_API_DEFAULT_NUM_OF_ROWS,
  });
  const repository = new KoreaTourAccessibilityAdapter(apiClient, {
    destination: performanceConfig.cache.destination,
    accessibility: performanceConfig.cache.accessibility,
  });

  return {
    destinationResolver: new DestinationResolver(repository),
    accessibilityService: new AccessibilityService(repository),
  };
}

function createChargerService(env: NodeJS.ProcessEnv): ChargerService {
  const httpClient = createHttpClient({
    baseUrl: getRequiredEnv(env, "WHEELCHAIR_CHARGER_API_BASE_URL"),
    source: "charger",
  });
  const apiClient = new WheelChairChargerApiClient(httpClient, {
    endpointUrl: WHEELCHAIR_CHARGER_API_ENDPOINT_PATH,
    serviceKey: getRequiredEnv(env, "WHEELCHAIR_CHARGER_API_SERVICE_KEY"),
  });
  const repository = new WheelChairChargerAdapter(apiClient, performanceConfig.cache.chargerRegion);

  return new ChargerService(repository);
}

function createWeatherService(env: NodeJS.ProcessEnv): WeatherService {
  const httpClient = createHttpClient({
    baseUrl: getRequiredEnv(env, "KMA_WEATHER_API_BASE_URL"),
    source: "weather",
  });
  const apiClient = new KmaWeatherApiClient(httpClient, {
    endpointUrl: KMA_WEATHER_API_ENDPOINT_PATH,
    serviceKey: getRequiredEnv(env, "KMA_WEATHER_API_SERVICE_KEY"),
  });
  const repository = new KmaWeatherAdapter(apiClient, performanceConfig.cache.weather);

  return new WeatherService(repository);
}

function createFestivalRiskService(env: NodeJS.ProcessEnv): FestivalRiskService {
  const httpClient = createHttpClient({
    baseUrl: getRequiredEnv(env, "FESTIVAL_API_BASE_URL"),
    source: "festival",
  });
  const apiClient = new FestivalApiClient(httpClient, {
    path: FESTIVAL_API_ENDPOINT_PATH,
    serviceKey: getRequiredEnv(env, "FESTIVAL_API_SERVICE_KEY"),
    defaultPerPage: FESTIVAL_API_DEFAULT_PER_PAGE,
    ...optionalNumberProperty(
      "fullScanPageSize",
      getOptionalPositiveIntegerEnv(env, "FESTIVAL_API_FULL_SCAN_PAGE_SIZE"),
    ),
  });
  const repository = new FestivalAdapter(apiClient, {
    dataset: performanceConfig.cache.festivalDataset,
    dateIndex: performanceConfig.cache.festivalDateIndex,
  });

  return new FestivalRiskService(repository);
}

function getRequiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = getOptionalEnv(env, name);

  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
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
  readonly source: DownstreamSource;
}): FetchHttpClient {
  return new FetchHttpClient({
    baseUrl: options.baseUrl,
    source: options.source,
    defaultTimeoutMs: performanceConfig.externalApiTimeoutMs,
    maxRetries: performanceConfig.retryCount,
    retryBaseDelayMs: performanceConfig.retryBaseDelayMs,
    retryMaxDelayMs: performanceConfig.retryMaxDelayMs,
  });
}
