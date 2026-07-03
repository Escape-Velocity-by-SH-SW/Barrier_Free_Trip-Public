import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createContainer } from "./bootstrap/create-container.js";
import { createServer } from "./bootstrap/create-server.js";
import { registerTools } from "./bootstrap/register-tools.js";

const envFilePath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");

async function main(): Promise<void> {
  config({ path: envFilePath, quiet: true });

  const container = createContainer();
  const server = createServer();

  registerTools(server, container);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[accessible-visit-mcp] stdio server started");
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error("[accessible-visit-mcp] fatal startup error", error);
  } else {
    console.error("[accessible-visit-mcp] fatal startup error", String(error));
  }
  process.exitCode = 1;
});
