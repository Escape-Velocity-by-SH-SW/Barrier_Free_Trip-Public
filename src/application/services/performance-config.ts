export const performanceConfig = {
  overallDeadlineMs: 2_900,
  responseReserveMs: 400,
  maxSourceBudgetMs: 2_300,
  externalApiTimeoutMs: 2_500,
  maxDestinations: 5,
  destinationConcurrency: 2,
  retryCount: 0,
  retryBaseDelayMs: 40,
  retryMaxDelayMs: 200,
  cache: {
    destination: { ttlMs: 24 * 60 * 60 * 1_000, maxEntries: 256 },
    accessibility: { ttlMs: 12 * 60 * 60 * 1_000, maxEntries: 512 },
    festivalDataset: { ttlMs: 6 * 60 * 60 * 1_000, maxEntries: 1 },
    festivalDateIndex: { ttlMs: 6 * 60 * 60 * 1_000, maxEntries: 32 },
    chargerRegion: { ttlMs: 30 * 60 * 1_000, maxEntries: 64 },
    weather: { ttlMs: 10 * 60 * 1_000, maxEntries: 256 },
  },
} as const;
