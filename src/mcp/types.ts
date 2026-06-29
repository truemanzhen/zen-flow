export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Promise<McpToolResult>;
}

export function jsonResult(value: unknown): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    isError: false,
  };
}

export function errorResult(message: string): McpToolResult {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}
