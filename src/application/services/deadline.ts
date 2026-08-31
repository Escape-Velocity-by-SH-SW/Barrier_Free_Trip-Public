import type { DeadlineTelemetryDetails, OperationContext } from "../ports/operation-context.js";

export class DeadlineExceededError extends Error {
  constructor() {
    super("MCP tool deadline exceeded.");
    this.name = "DeadlineExceededError";
  }
}

export async function runWithDeadline<TResult>(
  timeoutMs: number,
  operation: (context: OperationContext) => Promise<TResult>,
  baseContext: OperationContext = {},
  telemetryDetails: DeadlineTelemetryDetails = {},
): Promise<TResult> {
  if (baseContext.signal?.aborted === true) {
    throw toAbortError(baseContext.signal.reason);
  }

  const controller = new AbortController();
  const requestedDeadlineAtMs = Date.now() + timeoutMs;
  const deadlineAtMs = Math.min(
    baseContext.deadlineAtMs ?? requestedDeadlineAtMs,
    requestedDeadlineAtMs,
  );
  const remainingMs = deadlineAtMs - Date.now();
  if (remainingMs <= 0) {
    baseContext.telemetry?.recordDeadlineExceeded(telemetryDetails);
    throw new DeadlineExceededError();
  }

  let rejectTermination: (error: Error) => void = () => undefined;
  const abortFromCaller = (): void => {
    const error = toAbortError(baseContext.signal?.reason);
    controller.abort(error);
    rejectTermination(error);
  };
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const terminationResult = new Promise<never>((_resolve, reject) => {
    rejectTermination = reject;
    timeoutId = setTimeout(() => {
      if (controller.signal.aborted) return;
      const error = new DeadlineExceededError();
      baseContext.telemetry?.recordDeadlineExceeded(telemetryDetails);
      controller.abort(error);
      reject(error);
    }, remainingMs);
  });
  baseContext.signal?.addEventListener("abort", abortFromCaller, { once: true });

  try {
    return await Promise.race([
      operation({
        ...baseContext,
        signal: controller.signal,
        deadlineAtMs,
      }),
      terminationResult,
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    baseContext.signal?.removeEventListener("abort", abortFromCaller);
  }
}

function toAbortError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error("MCP tool operation was aborted.");
}
