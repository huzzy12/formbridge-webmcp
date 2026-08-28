export interface WebMcpToolResult {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: unknown;
  isError?: boolean;
  annotations?: { untrustedContentHint?: boolean };
}

export interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
  execute: (input: unknown, context?: { signal?: AbortSignal }) => Promise<WebMcpToolResult>;
}

export interface WebMcpModelContext {
  registerTool(tool: WebMcpToolDefinition): void;
  unregisterTool(name: string): void;
}

declare global {
  interface Document {
    modelContext?: WebMcpModelContext;
  }
}

export interface AgentActivity {
  id: string;
  toolName: string;
  status: "succeeded" | "rejected";
  summary: string;
  occurredAt: string;
}

