export function toLoggableError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(getOptionalProperty(error, "kind") !== undefined
        ? { kind: getOptionalProperty(error, "kind") }
        : {}),
      ...(getOptionalProperty(error, "status") !== undefined
        ? { status: getOptionalProperty(error, "status") }
        : {}),
      ...(getOptionalProperty(error, "retryAfterSeconds") !== undefined
        ? { retryAfterSeconds: getOptionalProperty(error, "retryAfterSeconds") }
        : {}),
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
    };
  }

  return {
    value: error,
  };
}

function getOptionalProperty(value: object, property: string): unknown {
  return Object.prototype.hasOwnProperty.call(value, property)
    ? (value as Record<string, unknown>)[property]
    : undefined;
}
