import type { OperationContext } from "../ports/operation-context.js";

export async function runWithDeadline<TResult>(
  timeoutMs: number,
  operation: (context: OperationContext) => Promise<TResult>,
): Promise<TResult> {
  const controller = new AbortController();
  const deadlineAtMs = Date.now() + timeoutMs;
  const timeoutId = setTimeout(
    () => controller.abort(new Error("MCP tool deadline exceeded.")),
    timeoutMs,
  );

  try {
    return await operation({ signal: controller.signal, deadlineAtMs });
  } finally {
    clearTimeout(timeoutId);
  }
}
