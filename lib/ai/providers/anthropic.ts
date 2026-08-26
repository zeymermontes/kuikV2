import type { AIProvider, ChatRequest, ChatResponse, ToolCall } from '../types';

/**
 * Anthropic's Messages API. Different enough from the OpenAI shape to need its
 * own adapter rather than a flag:
 *   - `system` is a top-level parameter, not a message
 *   - tools declare `input_schema`, not `parameters`
 *   - tool results come back as `tool_result` CONTENT BLOCKS inside a user
 *     message, not as a `tool` role
 */
export const anthropic: AIProvider = {
  id: 'anthropic',

  async chat(req: ChatRequest): Promise<ChatResponse> {
    type Block = Record<string, unknown>;
    const messages: { role: 'user' | 'assistant'; content: string | Block[] }[] = [];

    for (const m of req.messages) {
      if (m.role === 'tool') {
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }],
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const res = await fetch(`${req.baseUrl || 'https://api.anthropic.com/v1'}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': req.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: req.model,
        system: req.system,
        messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature,
        ...(req.tools.length
          ? {
              tools: req.tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.parameters,
              })),
            }
          : {}),
      }),
      signal: req.signal,
    });

    if (!res.ok) {
      throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const json = (await res.json()) as {
      content?: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim();

    const toolCalls: ToolCall[] = (json.content ?? [])
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id ?? '', name: b.name ?? '', arguments: b.input ?? {} }));

    return {
      text: text || null,
      toolCalls,
      truncated: json.stop_reason === 'max_tokens',
      usage: {
        promptTokens: json.usage?.input_tokens ?? 0,
        completionTokens: json.usage?.output_tokens ?? 0,
      },
    };
  },
};
