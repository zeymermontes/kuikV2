export type ProviderId = 'deepseek' | 'openai' | 'gemini' | 'anthropic' | 'kimi';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** Set on role:'tool' — which call this is answering. */
  toolCallId?: string;
  toolName?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema, produced once from a Zod schema via z.toJSONSchema(). */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  model: string;
  maxTokens: number;
  temperature: number;
  apiKey: string;
  baseUrl?: string;
  signal: AbortSignal;
}

export interface ChatResponse {
  text: string | null;
  toolCalls: ToolCall[];
  usage: Usage;
  /** The reply was cut off by the token ceiling rather than finished. */
  truncated?: boolean;
}

export interface AIProvider {
  id: ProviderId;
  chat(req: ChatRequest): Promise<ChatResponse>;
}
