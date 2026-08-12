import { createToolResult, type TextToolResult } from "../tools/tool-result.js";
import type { KakaoWidgetEnvelope } from "./widget-types.js";

export interface CreateWidgetToolResultOptions {
  readonly buildEnvelope: () => KakaoWidgetEnvelope;
  readonly fallbackText?: string;
  readonly logError?: (error: unknown) => void;
}

/** Domain structuredContent는 보존하고 Kakao Widget envelope만 text content에 넣는다. */
export function createWidgetToolResult(
  output: object,
  options: CreateWidgetToolResultOptions,
): TextToolResult {
  try {
    const envelope = options.buildEnvelope();
    return {
      structuredContent: output as Record<string, unknown>,
      content: [
        {
          type: "text",
          text: JSON.stringify(envelope),
        },
      ],
    };
  } catch (error) {
    (options.logError ?? logWidgetBuildFailure)(error);
    return createToolResult(output, options.fallbackText);
  }
}

function logWidgetBuildFailure(error: unknown): void {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "widget.build.error",
      tool: "assess_accessible_visit",
      errorName,
      errorMessage: "Widget build failed.",
    }),
  );
}
