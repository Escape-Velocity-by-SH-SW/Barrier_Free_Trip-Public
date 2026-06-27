import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { createContainer } from "../../src/bootstrap/create-container.js";
import { createServer } from "../../src/bootstrap/create-server.js";
import { registerGetDestinationWeatherTool } from "../../src/mcp/tools/get-destination-weather.tool.js";
import { getDestinationWeatherOutputSchema } from "../../src/mcp/tools/get-destination-weather.tool.js";

describe("get_destination_weather tool", () => {
  it("returns mock structured content that matches the output schema", async () => {
    const container = createContainer();
    const server = createServer();
    const client = new Client({
      name: "get-destination-weather-test-client",
      version: "0.1.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    registerGetDestinationWeatherTool(server, container);

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.callTool({
        name: "get_destination_weather",
        arguments: {
          destination: "경복궁",
          visitDate: "2026-06-27",
          travelerType: "POWER_WHEELCHAIR",
        },
      });

      const structuredContent = z
        .object(getDestinationWeatherOutputSchema)
        .parse(result.structuredContent);

      expect(structuredContent.status).toBe("AVAILABLE");
      expect(structuredContent.destination.name).toBe("경복궁");
      expect(structuredContent.visitDate).toBe("2026-06-27");
      expect(structuredContent.travelerType).toBe("POWER_WHEELCHAIR");
      expect(structuredContent.cautions).toContain("MCP 연결 확인을 위한 Mock 날씨 데이터입니다.");
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
