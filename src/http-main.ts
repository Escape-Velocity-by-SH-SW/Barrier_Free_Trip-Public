import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { StreamableHTTPServerTransportOptions } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { createContainer } from "./bootstrap/create-container.js";
import { createServer } from "./bootstrap/create-server.js";
import { registerTools } from "./bootstrap/register-tools.js";
import {
  createStructuredLogEvent,
  toSafeErrorFields,
  writeStructuredLog,
} from "./application/services/logging.js";

const defaultPort = 3000;
const mcpPath = "/mcp";
const requestTimeoutMs = 30_000;
const headersTimeoutMs = 10_000;

function main(): void {
  const container = createContainer();
  const port = getPort(process.env.PORT);

  const httpServer = createHttpServer((request, response) => {
    void handleHttpRequest(request, response, container);
  });
  httpServer.requestTimeout = requestTimeoutMs;
  httpServer.headersTimeout = headersTimeoutMs;

  httpServer.on("error", (error) => {
    writeStructuredLog(createStructuredLogEvent("error", "server.error", toSafeErrorFields(error)));
    process.exitCode = 1;
    process.exit();
  });

  registerShutdownHandlers(httpServer);

  httpServer.listen(port, () => {
    writeStructuredLog(
      createStructuredLogEvent("info", "server.started", {
        transport: "streamable-http",
        port,
      }),
    );
  });
}

async function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  container: ReturnType<typeof createContainer>,
): Promise<void> {
  let server: ReturnType<typeof createServer> | undefined;
  let transport: StreamableHTTPServerTransport | undefined;

  try {
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

    server = createServer();
    transport = new StreamableHTTPServerTransport(createStatelessTransportOptions());
    registerTools(server, container);
    await server.connect(transport as unknown as Transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    writeStructuredLog(
      createStructuredLogEvent("error", "server.request.error", toSafeErrorFields(error)),
    );

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
      void transport?.close();
      void server?.close();
    });
  }
}

function registerShutdownHandlers(httpServer: ReturnType<typeof createHttpServer>): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    writeStructuredLog(createStructuredLogEvent("info", "server.shutdown", { signal }));
    httpServer.close((error) => {
      if (error !== undefined) {
        writeStructuredLog(
          createStructuredLogEvent("error", "server.shutdown.error", toSafeErrorFields(error)),
        );
        process.exitCode = 1;
      }

      process.exit();
    });
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
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

function writeJsonResponse(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

try {
  main();
} catch (error) {
  writeStructuredLog(
    createStructuredLogEvent("error", "server.startup.error", toSafeErrorFields(error)),
  );
  process.exitCode = 1;
}
