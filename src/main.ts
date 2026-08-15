import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createContainer } from "./bootstrap/create-container.js";
import { createServer } from "./bootstrap/create-server.js";
import { registerTools } from "./bootstrap/register-tools.js";
import {
  createStructuredLogEvent,
  toSafeErrorFields,
  writeStructuredLog,
} from "./application/services/logging.js";

async function main(): Promise<void> {
  const container = createContainer();
  const server = createServer();

  registerTools(server, container);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  writeStructuredLog(createStructuredLogEvent("info", "server.started", { transport: "stdio" }));
}

main().catch((error: unknown) => {
  writeStructuredLog(
    createStructuredLogEvent("error", "server.startup.error", toSafeErrorFields(error)),
  );
  process.exitCode = 1;
});
