import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { StreamableHTTPServerTransportOptions } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "dotenv";
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createContainer } from "./bootstrap/create-container.js";
import { createServer } from "./bootstrap/create-server.js";
import { registerTools } from "./bootstrap/register-tools.js";

const envFilePath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
const defaultPort = 3000;
const mcpPath = "/mcp";

function main(): void {
  config({ path: envFilePath, quiet: true });

  const container = createContainer();
  const port = getPort(process.env.PORT);

  const httpServer = createHttpServer((request, response) => {
    void handleHttpRequest(request, response, container);
  });

  httpServer.listen(port, () => {
    console.error(`[accessible-visit-mcp] streamable http server started on port ${port}`);
  });
}

async function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  container: ReturnType<typeof createContainer>,
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (requestUrl.pathname !== mcpPath) {
    writeJsonResponse(response, 404, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Not found.",
      },
      id: null,
    });
    return;
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport(createStatelessTransportOptions());

  try {
    registerTools(server, container);
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    console.error("[accessible-visit-mcp] streamable http request error", toLoggableError(error));

    if (!response.headersSent) {
      writeJsonResponse(response, 500, {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error.",
        },
        id: null,
      });
    }
  } finally {
    response.on("close", () => {
      void transport.close();
      void server.close();
    });
  }
}

function createStatelessTransportOptions(): StreamableHTTPServerTransportOptions {
  return { sessionIdGenerator: undefined } as unknown as StreamableHTTPServerTransportOptions;
}

function getPort(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) {
    return defaultPort;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

function writeJsonResponse(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function toLoggableError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
    };
  }

  return { value: error };
}

try {
  main();
} catch (error) {
  console.error("[accessible-visit-mcp] fatal streamable http startup error", toLoggableError(error));
  process.exitCode = 1;
}
