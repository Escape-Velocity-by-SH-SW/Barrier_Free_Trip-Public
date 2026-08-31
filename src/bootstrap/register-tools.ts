import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AppContainer } from "./create-container.js";
import { registerAssessAccessibleVisitTool } from "../mcp/tools/assess-accessible-visit.tool.js";
import { registerFindNearbyWheelchairChargersTool } from "../mcp/tools/find-nearby-wheelchair-chargers.tool.js";
import { registerGetDestinationAccessibilityTool } from "../mcp/tools/get-destination-accessibility.tool.js";
import { registerGetDestinationEventRiskTool } from "../mcp/tools/get-destination-event-risk.tool.js";
import { registerGetDestinationWeatherTool } from "../mcp/tools/get-destination-weather.tool.js";

export function registerTools(server: McpServer, container: AppContainer): void {
  registerGetDestinationWeatherTool(server, container);
  registerFindNearbyWheelchairChargersTool(server, container);
  registerGetDestinationAccessibilityTool(server, container);
  registerGetDestinationEventRiskTool(server, container);
  registerAssessAccessibleVisitTool(server, container);
}
