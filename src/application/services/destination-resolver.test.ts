import { describe, expect, it, vi } from "vitest";

import type { TourismAccessibilityRepository } from "../ports/tourism-accessibility.repository.js";
import type { DestinationCandidate } from "../../domain/destination.js";
import { DestinationResolver } from "./destination-resolver.js";

describe("DestinationResolver", () => {
  it("returns NOT_FOUND without calling the repository for blank input", async () => {
    const testDouble = createRepository([]);
    const resolver = new DestinationResolver(testDouble.repository);

    await expect(resolver.resolve("   ")).resolves.toEqual({ status: "NOT_FOUND" });
    expect(testDouble.searchDestination).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the repository has no candidates", async () => {
    const testDouble = createRepository([]);
    const resolver = new DestinationResolver(testDouble.repository);

    await expect(resolver.resolve("경복궁")).resolves.toEqual({ status: "NOT_FOUND" });
  });

  it("resolves a single exact candidate and strips candidate-only metadata", async () => {
    const testDouble = createRepository([createCandidate("경복궁", "경복궁", "EXACT")]);
    const resolver = new DestinationResolver(testDouble.repository);

    await expect(resolver.resolve(" 경 복 궁 ")).resolves.toEqual({
      status: "RESOLVED",
      destination: {
        name: "경복궁",
        contentId: "경복궁-id",
        contentTypeId: "12",
        address: "서울특별시 종로구",
        coordinates: {
          latitude: 37.579617,
          longitude: 126.976998,
        },
      },
    });
    expect(testDouble.searchDestination).toHaveBeenCalledWith("경 복 궁");
  });

  it("resolves a single partial candidate because there is no ambiguity", async () => {
    const testDouble = createRepository([
      createCandidate("경복궁 야간관람", "경복궁야간관람", "PARTIAL"),
    ]);
    const resolver = new DestinationResolver(testDouble.repository);

    await expect(resolver.resolve("경복궁")).resolves.toMatchObject({
      status: "RESOLVED",
      destination: {
        name: "경복궁 야간관람",
      },
    });
  });

  it("returns AMBIGUOUS when multiple candidates remain possible", async () => {
    const candidates = [
      createCandidate("경복궁 야간관람", "경복궁야간관람", "PARTIAL"),
      createCandidate("경복궁 주차장", "경복궁주차장", "PARTIAL"),
    ];
    const testDouble = createRepository(candidates);
    const resolver = new DestinationResolver(testDouble.repository);

    await expect(resolver.resolve("경복궁")).resolves.toEqual({
      status: "AMBIGUOUS",
      candidates,
    });
  });

  it("returns AMBIGUOUS with exact candidates when multiple exact matches exist", async () => {
    const exactCandidates = [
      createCandidate("경복궁", "경복궁", "EXACT"),
      createCandidate("경 복궁", "경복궁", "EXACT"),
    ];
    const repositoryCandidates = [
      ...exactCandidates,
      createCandidate("경복궁 야간관람", "경복궁야간관람", "PARTIAL"),
    ];
    const testDouble = createRepository(repositoryCandidates);
    const resolver = new DestinationResolver(testDouble.repository);

    await expect(resolver.resolve("경복궁")).resolves.toEqual({
      status: "AMBIGUOUS",
      candidates: exactCandidates,
    });
  });
});

interface RepositoryTestDouble {
  repository: TourismAccessibilityRepository;
  searchDestination: ReturnType<typeof vi.fn>;
}

function createRepository(candidates: DestinationCandidate[]): RepositoryTestDouble {
  const searchDestination = vi.fn(() => Promise.resolve(candidates));
  const getAccessibility = vi.fn(() => Promise.resolve({}));

  return {
    repository: {
      searchDestination,
      getAccessibility,
    },
    searchDestination,
  };
}

function createCandidate(
  name: string,
  normalizedName: string,
  matchType: DestinationCandidate["matchType"],
): DestinationCandidate {
  return {
    name,
    contentId: `${name}-id`,
    contentTypeId: "12",
    address: "서울특별시 종로구",
    coordinates: {
      latitude: 37.579617,
      longitude: 126.976998,
    },
    normalizedName,
    matchType,
  };
}
