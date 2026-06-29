import type { McpTool, McpToolResult } from './types.js';
import { errorResult } from './types.js';

export class ToolRegistry {
  private readonly tools = new Map<string, McpTool>();

  register(tool: McpTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  list(): McpTool[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, input: Record<string, unknown>): Promise<McpToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return errorResult(`Unknown tool: ${name}`);
    }
    return tool.handler(input);
  }
}
