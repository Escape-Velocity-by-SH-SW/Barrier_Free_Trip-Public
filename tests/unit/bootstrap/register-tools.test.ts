import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createContainer } from "../../../src/bootstrap/create-container.js";
import { createServer } from "../../../src/bootstrap/create-server.js";
import { registerTools } from "../../../src/bootstrap/register-tools.js";

describe("registerTools", () => {
  it("registers accessible visit MCP tools", async () => {
    const container = createContainer();
    const server = createServer();
    const client = new Client({
      name: "register-tools-test-client",
      version: "0.1.0",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    registerTools(server, container);

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    try {
      const result = await client.listTools();
      const toolNames = result.tools.map((tool) => tool.name);

      expect(toolNames).toEqual([
        "get_destination_weather",
        "find_nearby_wheelchair_chargers",
        "get_destination_accessibility",
        "get_destination_event_risk",
        "assess_accessible_visit",
      ]);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
