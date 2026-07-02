import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import type {
  DestinationCandidate,
  DestinationResolutionResult,
} from "../../domain/destination.js";

const sourceSchema = z.object({
  name: z.string(),
  status: z.enum(["SUCCESS", "NO_DATA", "FAILED"]),
  description: z.string().optional(),
});

const destinationSchema = z.object({
  name: z.string(),
  contentId: z.string(),
  contentTypeId: z.string(),
  address: z.string().optional(),
  coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
});

const candidateSchema = z.object({
  contentId: z.string(),
  contentTypeId: z.string(),
  name: z.string(),
  address: z.string().optional(),
  coordinates: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }),
  imageUrl: z.string().optional(),
});

export const getDestinationEventRiskInputSchema = {
  destination: z.string().trim().min(1).optional(),
  destinationName: z.string().trim().min(1).optional(),
  contentId: z.string().trim().min(1).optional(),
  visitDate: z.iso.date(),
  radiusKm: z.number().min(0.1).max(20).default(3),
};

export const getDestinationEventRiskOutputSchema = {
  status: z.enum(["SUCCESS", "NO_DATA", "AMBIGUOUS_DESTINATION", "FAILED"]),
  message: z.string().optional(),
  destination: destinationSchema.optional(),
  visitDate: z.iso.date(),
  radiusKm: z.number().positive(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]).optional(),
  festivals: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        venue: z.string().optional(),
        address: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        distanceKm: z.number().optional(),
        phoneNumber: z.string().optional(),
        referenceDate: z.string().optional(),
      }),
    )
    .optional(),
  cautions: z.array(z.string()),
  candidates: z.array(candidateSchema).optional(),
  sources: z.array(sourceSchema),
};

type GetDestinationEventRiskInput = z.output<
  z.ZodObject<typeof getDestinationEventRiskInputSchema>
>;
type GetDestinationEventRiskOutput = z.output<
  z.ZodObject<typeof getDestinationEventRiskOutputSchema>
>;

export function registerGetDestinationEventRiskTool(
  server: McpServer,
  container: AppContainer,
): void {
  server.registerTool(
    "get_destination_event_risk",
    {
      title: "Get Destination Event Risk",
      description: "방문일에 관광지 주변 축제를 조회하고 행사 기반 혼잡 위험을 반환합니다.",
      inputSchema: getDestinationEventRiskInputSchema,
      outputSchema: getDestinationEventRiskOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (input) => {
      const contentId = getContentId(input);
      const destinationName = getDestinationName(input);

      if (contentId !== undefined) {
        return createToolResult(await createContentIdFestivalRiskOutput(input, container));
      }

      if (destinationName === undefined) {
        return createToolResult(
          createFailedOutput(
            "관광지명 또는 contentId 중 하나는 반드시 입력해야 합니다.",
            input.visitDate,
            input.radiusKm,
            [],
          ),
        );
      }

      const resolution = await container.services.destinationResolver.resolve(destinationName);

      if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
        return createToolResult(
          createDestinationResolutionFailureOutput(resolution, input.visitDate, input.radiusKm),
        );
      }

      const result = await container.services.festivalRiskService.assess({
        destination: resolution.destination,
        visitDate: input.visitDate,
        radiusKm: input.radiusKm,
      });
      const output: GetDestinationEventRiskOutput = {
        ...result,
        sources: [
          {
            name: "한국관광공사 searchKeyword2",
            status: "SUCCESS",
            description: "관광지명으로 contentId와 좌표를 식별했습니다.",
          },
          {
            name: "전국문화축제표준데이터",
            status: result.status,
            description: "방문일과 반경 기준으로 주변 축제를 조회했습니다.",
          },
        ],
      };

      return createToolResult(output);
    },
  );
}

function getDestinationName(input: GetDestinationEventRiskInput): string | undefined {
  const destinationName = input.destinationName ?? input.destination;
  return destinationName !== undefined && destinationName.length > 0 ? destinationName : undefined;
}

function getContentId(input: GetDestinationEventRiskInput): string | undefined {
  return input.contentId !== undefined && input.contentId.length > 0 ? input.contentId : undefined;
}

async function createContentIdFestivalRiskOutput(
  input: GetDestinationEventRiskInput,
  container: AppContainer,
): Promise<GetDestinationEventRiskOutput> {
  const contentId = getContentId(input);
  const destinationName = getDestinationName(input);

  if (contentId === undefined) {
    return createFailedOutput(
      "관광지명 또는 contentId 중 하나는 반드시 입력해야 합니다.",
      input.visitDate,
      input.radiusKm,
      [],
    );
  }

  if (destinationName === undefined) {
    return createFailedOutput(
      "축제 위험 조회는 거리 계산을 위한 좌표가 필요합니다. contentId만으로는 좌표를 확정할 수 없으므로 destinationName을 함께 입력해주세요.",
      input.visitDate,
      input.radiusKm,
      [],
    );
  }

  const resolution = await container.services.destinationResolver.resolveByContentId({
    contentId,
    destinationName,
  });

  if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
    return createDestinationResolutionFailureOutput(resolution, input.visitDate, input.radiusKm);
  }

  const result = await container.services.festivalRiskService.assess({
    destination: resolution.destination,
    visitDate: input.visitDate,
    radiusKm: input.radiusKm,
  });

  return {
    ...result,
    sources: [
      {
        name: "한국관광공사 searchKeyword2",
        status: "SUCCESS",
        description: "관광지명과 contentId로 후보 중 선택된 관광지를 확정했습니다.",
      },
      {
        name: "전국문화축제표준데이터",
        status: result.status,
        description: "방문일과 반경 기준으로 주변 축제를 조회했습니다.",
      },
    ],
  };
}

function createDestinationResolutionFailureOutput(
  resolution: DestinationResolutionResult,
  visitDate: string,
  radiusKm: number,
): GetDestinationEventRiskOutput {
  if (resolution.status === "FAILED") {
    return createFailedOutput("관광지 검색 정보를 조회하지 못했습니다.", visitDate, radiusKm, [
      {
        name: "한국관광공사 searchKeyword2",
        status: "FAILED",
        description: "관광지명 검색 API 호출에 실패했습니다.",
      },
    ]);
  }

  if (resolution.status === "AMBIGUOUS_DESTINATION") {
    return {
      status: "AMBIGUOUS_DESTINATION",
      message: "관광지가 여러 개 검색되었습니다. 후보 중 하나를 선택해 다시 요청해주세요.",
      visitDate,
      radiusKm,
      cautions: ["후보 중 하나의 contentId를 선택해 같은 Tool을 다시 호출하세요."],
      candidates: toCandidateSummaries(resolution.candidates ?? []),
      sources: [
        {
          name: "한국관광공사 searchKeyword2",
          status: "SUCCESS",
          description: "관광지 후보를 조회했습니다.",
        },
      ],
    };
  }

  return {
    status: "NO_DATA",
    message: "검색 결과가 없습니다.",
    visitDate,
    radiusKm,
    cautions: ["입력한 관광지명 또는 contentId로 관광지를 확정하지 못했습니다."],
    sources: [
      {
        name: "한국관광공사 searchKeyword2",
        status: "NO_DATA",
        description: "검색 결과가 없습니다.",
      },
    ],
  };
}

function toCandidateSummaries(
  candidates: DestinationCandidate[],
): NonNullable<GetDestinationEventRiskOutput["candidates"]> {
  return candidates.slice(0, 5).map((candidate) => ({
    contentId: candidate.contentId,
    contentTypeId: candidate.contentTypeId,
    name: candidate.name,
    ...(candidate.address !== undefined ? { address: candidate.address } : {}),
    coordinates: candidate.coordinates,
    ...(candidate.imageUrl !== undefined ? { imageUrl: candidate.imageUrl } : {}),
  }));
}

function createFailedOutput(
  caution: string,
  visitDate: string,
  radiusKm: number,
  sources: GetDestinationEventRiskOutput["sources"],
): GetDestinationEventRiskOutput {
  return {
    status: "FAILED",
    message: caution,
    visitDate,
    radiusKm,
    riskLevel: "UNKNOWN",
    festivals: [],
    cautions: [caution],
    sources,
  };
}

function createToolResult(output: GetDestinationEventRiskOutput): {
  structuredContent: GetDestinationEventRiskOutput;
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    structuredContent: output,
    content: [
      {
        type: "text",
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}
