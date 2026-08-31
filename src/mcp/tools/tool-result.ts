export interface TextToolResult {
  [key: string]: unknown;
  structuredContent: Record<string, unknown>;
  content: Array<{ type: "text"; text: string }>;
}

export function createToolResult(output: object, text?: string): TextToolResult {
  return {
    structuredContent: output as Record<string, unknown>,
    content: [
      {
        type: "text",
        text: text ?? JSON.stringify(output, null, 2),
      },
    ],
  };
}
