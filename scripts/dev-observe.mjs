import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = process.cwd();
const logsDirectory = resolve(projectRoot, "logs");
const logFile = resolve(logsDirectory, "mcp.ndjson");
mkdirSync(logsDirectory, { recursive: true });

const fileStream = createWriteStream(logFile, { flags: "a" });
const server = spawn(process.execPath, ["--env-file=.env", "dist/http-main.js"], {
  cwd: projectRoot,
  env: process.env,
  stdio: ["inherit", "inherit", "pipe"],
});

server.stderr.on("data", (chunk) => {
  process.stderr.write(chunk);
  fileStream.write(chunk);
});

server.on("error", (error) => {
  process.stderr.write(`로컬 관측 서버를 시작하지 못했습니다: ${error.message}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  fileStream.end(() => {
    process.exitCode = code ?? (signal === null ? 1 : 0);
  });
});
