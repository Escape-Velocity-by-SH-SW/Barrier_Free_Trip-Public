import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { AppContainer } from "../../bootstrap/create-container.js";
import { travelerTypes, type TravelerType } from "../../domain/accessibility.js";
import type {
  DestinationCandidate,
  DestinationResolutionResult,
} from "../../domain/destination.js";

const evidenceItemSchema = z.object({
  status: z.enum(["CONFIRMED", "NOT_AVAILABLE", "NOT_PROVIDED", "CONFLICTING"]),
  description: z.string().optional(),
});

const toolTravelerTypes = [
  "POWER_WHEELCHAIR",
  "MANUAL_WHEELCHAIR",
  "STROLLER",
  "ELDERLY_COMPANION",
  "WHEELCHAIR",
  "ELDERLY",
  "VISUALLY_IMPAIRED",
  "HEARING_IMPAIRED",
] as const;

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

const facilitiesSchema = z.object({
  parking: evidenceItemSchema,
  route: evidenceItemSchema,
  entrance: evidenceItemSchema,
  elevator: evidenceItemSchema,
  restroom: evidenceItemSchema,
  wheelchairRental: evidenceItemSchema,
  stroller: evidenceItemSchema,
  lactationRoom: evidenceItemSchema,
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

export const getDestinationAccessibilityInputSchema = {
  destination: z.string().trim().min(1).optional(),
  destinationName: z.string().trim().min(1).optional(),
  contentId: z.string().trim().min(1).optional(),
  contentTypeId: z.string().trim().min(1).optional(),
  travelerType: z.enum(toolTravelerTypes).optional(),
};

export const getDestinationAccessibilityOutputSchema = {
  status: z.enum(["SUCCESS", "NO_DATA", "AMBIGUOUS_DESTINATION", "FAILED"]),
  message: z.string().optional(),
  destination: destinationSchema.optional(),
  travelerType: z.enum(travelerTypes).optional(),
  facilities: facilitiesSchema.optional(),
  cautions: z.array(z.string()).optional(),
  unknowns: z.array(z.string()).optional(),
  candidates: z.array(candidateSchema).optional(),
  sources: z.array(sourceSchema),
};

type GetDestinationAccessibilityInput = z.output<
  z.ZodObject<typeof getDestinationAccessibilityInputSchema>
>;
type GetDestinationAccessibilityOutput = z.output<
  z.ZodObject<typeof getDestinationAccessibilityOutputSchema>
>;

export function registerGetDestinationAccessibilityTool(
  server: McpServer,
  container: AppContainer,
): void {
  server.registerTool(
    "get_destination_accessibility",
    {
      title: "Get Destination Accessibility",
      description: "관광지의 무장애 편의시설 정보를 조회합니다.",
      inputSchema: getDestinationAccessibilityInputSchema,
      outputSchema: getDestinationAccessibilityOutputSchema,
      annotations: {
        readOnlyHint: true,
      },
    },
    async (input) => {
      const contentId = getContentId(input);
      const destinationName = getDestinationName(input);
      const travelerType = normalizeTravelerType(input.travelerType);

      if (contentId !== undefined) {
        return createToolResult(await createContentIdAccessibilityOutput(input, container));
      }

      if (destinationName === undefined) {
        return createToolResult(
          createFailedOutput(
            "관광지명 또는 contentId 중 하나는 반드시 입력해야 합니다.",
            travelerType,
            [],
          ),
        );
      }

      const resolution = await container.services.destinationResolver.resolve(destinationName);

      if (resolution.status !== "RESOLVED" || resolution.destination === undefined) {
        return createToolResult(createDestinationResolutionFailureOutput(resolution, travelerType));
      }

      const result = await container.services.accessibilityService.getAccessibility({
        destination: resolution.destination,
        ...(travelerType !== undefined ? { travelerType } : {}),
      });
      const output: GetDestinationAccessibilityOutput = {
        ...result,
        sources: [
          {
            name: "한국관광공사 searchKeyword2",
            status: "SUCCESS",
            description: "관광지명으로 contentId와 좌표를 식별했습니다.",
          },
          {
            name: "한국관광공사 detailWithTour2",
            status: result.status,
            description: "contentId 기준 무장애 편의시설 상세 정보를 조회했습니다.",
          },
        ],
      };

      return createToolResult(output);
    },
  );
}

function getDestinationName(input: GetDestinationAccessibilityInput): string | undefined {
  const destinationName = input.destinationName ?? input.destination;
  return destinationName !== undefined && destinationName.length > 0 ? destinationName : undefined;
}

function getContentId(input: GetDestinationAccessibilityInput): string | undefined {
  return input.contentId !== undefined && input.contentId.length > 0 ? input.contentId : undefined;
}

function getContentTypeId(input: GetDestinationAccessibilityInput): string | undefined {
  return input.contentTypeId !== undefined && input.contentTypeId.length > 0
    ? input.contentTypeId
    : undefined;
}

function normalizeTravelerType(
  travelerType: GetDestinationAccessibilityInput["travelerType"],
): TravelerType | undefined {
  if (travelerType === undefined) {
    return undefined;
  }

  if (travelerType === "WHEELCHAIR") {
    return "POWER_WHEELCHAIR";
  }

  if (travelerType === "ELDERLY") {
    return "ELDERLY_COMPANION";
  }

  if (isTravelerType(travelerType)) {
    return travelerType;
  }

  return undefined;
}

function isTravelerType(value: string): value is TravelerType {
  return travelerTypes.some((travelerType) => travelerType === value);
}

async function createContentIdAccessibilityOutput(
  input: GetDestinationAccessibilityInput,
  container: AppContainer,
): Promise<GetDestinationAccessibilityOutput> {
  const contentId = getContentId(input);
  const travelerType = normalizeTravelerType(input.travelerType);

  if (contentId === undefined) {
    return createFailedOutput(
      "관광지명 또는 contentId 중 하나는 반드시 입력해야 합니다.",
      travelerType,
      [],
    );
  }

  const destinationName = getDestinationName(input);

  if (destinationName !== undefined) {
    const resolution = await container.services.destinationResolver.resolveByContentId({
      contentId,
      destinationName,
    });

    if (resolution.status === "RESOLVED" && resolution.destination !== undefined) {
      const result = await container.services.accessibilityService.getAccessibility({
        destination: resolution.destination,
        ...(travelerType !== undefined ? { travelerType } : {}),
      });

      return {
        ...result,
        sources: createAccessibilitySources("SUCCESS", result.status),
      };
    }
  }

  const contentTypeId = getContentTypeId(input);
  const result = await container.services.accessibilityService.getAccessibilityByContentId({
    contentId,
    ...(contentTypeId !== undefined ? { contentTypeId } : {}),
    ...(travelerType !== undefined ? { travelerType } : {}),
  });

  return {
    ...result,
    message:
      "contentId만으로 접근성 상세 정보는 조회했지만 관광지명, 주소, 좌표는 확정하지 못했습니다.",
    sources: [
      {
        name: "한국관광공사 detailWithTour2",
        status: result.status,
        description: "contentId 기준 무장애 편의시설 상세 정보를 조회했습니다.",
      },
    ],
  };
}

function createDestinationResolutionFailureOutput(
  resolution: DestinationResolutionResult,
  travelerType: TravelerType | undefined,
): GetDestinationAccessibilityOutput {
  if (resolution.status === "FAILED") {
    return createFailedOutput("관광지 검색 정보를 조회하지 못했습니다.", travelerType, [
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
      travelerType,
      candidates: toCandidateSummaries(resolution.candidates ?? []),
      cautions: ["후보 중 하나의 contentId를 선택해 같은 Tool을 다시 호출하세요."],
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
    travelerType,
    cautions: ["입력한 관광지명으로 검색된 후보가 없습니다."],
    sources: [
      {
        name: "한국관광공사 searchKeyword2",
        status: "NO_DATA",
        description: "검색 결과가 없습니다.",
      },
    ],
  };
}

function createAccessibilitySources(
  destinationLookupStatus: "SUCCESS" | "NO_DATA" | "FAILED",
  accessibilityLookupStatus: "SUCCESS" | "NO_DATA" | "FAILED",
): GetDestinationAccessibilityOutput["sources"] {
  return [
    {
      name: "한국관광공사 searchKeyword2",
      status: destinationLookupStatus,
      description: "관광지명과 contentId로 후보 중 선택된 관광지를 확정했습니다.",
    },
    {
      name: "한국관광공사 detailWithTour2",
      status: accessibilityLookupStatus,
      description: "contentId 기준 무장애 편의시설 상세 정보를 조회했습니다.",
    },
  ];
}

function toCandidateSummaries(
  candidates: DestinationCandidate[],
): NonNullable<GetDestinationAccessibilityOutput["candidates"]> {
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
  travelerType: TravelerType | undefined,
  sources: GetDestinationAccessibilityOutput["sources"],
): GetDestinationAccessibilityOutput {
  return {
    status: "FAILED",
    message: caution,
    travelerType,
    cautions: [caution],
    sources,
  };
}

function createToolResult(output: GetDestinationAccessibilityOutput): {
  structuredContent: GetDestinationAccessibilityOutput;
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
