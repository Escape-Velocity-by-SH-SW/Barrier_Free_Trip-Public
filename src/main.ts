import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createContainer } from "./bootstrap/create-container.js";
import { createServer } from "./bootstrap/create-server.js";
import { registerTools } from "./bootstrap/register-tools.js";

async function main(): Promise<void> {
  loadEnvFile();

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

function loadEnvFile(filePath = resolve(process.cwd(), ".env")): void {
  if (!existsSync(filePath)) {
    return;
  }

  const parsedEnv = parseEnvFile(readFileSync(filePath, "utf8"));

  for (const [key, value] of Object.entries(parsedEnv)) {
    process.env[key] ??= value;
  }
}

function parseEnvFile(contents: string): Record<string, string> {
  const parsedEnv: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0 || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const value = normalizeEnvValue(trimmedLine.slice(separatorIndex + 1).trim());

    if (key.length > 0) {
      parsedEnv[key] = value;
    }
  }

  return parsedEnv;
}

function normalizeEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
