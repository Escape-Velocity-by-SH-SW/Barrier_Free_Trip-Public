import type { OperationContext } from "../ports/operation-context.js";

export async function runWithDeadline<TResult>(
  timeoutMs: number,
  operation: (context: OperationContext) => Promise<TResult>,
  baseContext: OperationContext = {},
): Promise<TResult> {
  const controller = new AbortController();
  const requestedDeadlineAtMs = Date.now() + timeoutMs;
  const deadlineAtMs = Math.min(
    baseContext.deadlineAtMs ?? requestedDeadlineAtMs,
    requestedDeadlineAtMs,
  );
  const remainingMs = Math.max(1, deadlineAtMs - Date.now());
  const abortFromCaller = (): void => controller.abort(baseContext.signal?.reason);
  if (baseContext.signal?.aborted === true) {
    abortFromCaller();
  } else {
    baseContext.signal?.addEventListener("abort", abortFromCaller, { once: true });
  }
  const timeoutId = setTimeout(() => {
    if (controller.signal.aborted) {
      return;
    }
    baseContext.telemetry?.recordDeadlineExceeded();
    controller.abort(new Error("MCP tool deadline exceeded."));
  }, remainingMs);

  try {
    return await operation({
      ...baseContext,
      signal: controller.signal,
      deadlineAtMs,
    });
  } finally {
    clearTimeout(timeoutId);
    baseContext.signal?.removeEventListener("abort", abortFromCaller);
  }
}
