import { ChargerService } from "../application/services/charger.service.js";
import { WheelChairChargerApiClient } from "../infrastructure/charger/wheelchair-charger-api.client.js";
import { WheelChairChargerAdapter } from "../infrastructure/charger/wheelchair-charger.adapter.js";
import { FetchHttpClient } from "../infrastructure/http/http-client.js";

export interface AppContainer {
  readonly services: {
    readonly chargerService: ChargerService;
  };
}

export function createContainer(env: NodeJS.ProcessEnv = process.env): AppContainer {
  return {
    services: {
      chargerService: createChargerService(env),
    },
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

function getOptionalEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value !== undefined && value.length > 0 ? value : undefined;
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
