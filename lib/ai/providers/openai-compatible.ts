import type { AIProvider, ChatRequest, ChatResponse, ProviderId, ToolCall } from '../types';

/**
 * One adapter for four of the five providers.
 *
 * DeepSeek, OpenAI, Kimi and Gemini all speak the OpenAI chat-completions
 * shape, differing only in base URL and model name — so writing four clients
 * would be four times the surface for no benefit. Anthropic is genuinely
 * different and gets its own file.
 *
 * Plain fetch, no SDKs: five vendor packages and their transitive trees would
 * dwarf everything else in this project's dependency list.
 */
export function openAiCompatible(id: ProviderId, defaultBaseUrl: string): AIProvider {
  return {
    id,
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const messages: Record<string, unknown>[] = [
        { role: 'system', content: req.system },
        ...req.messages.map((m) =>
          m.role === 'tool'
            ? { role: 'tool', tool_call_id: m.toolCallId, name: m.toolName, content: m.content }
            : { role: m.role, content: m.content },
        ),
      ];

      const res = await fetch(`${req.baseUrl || defaultBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${req.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: req.model,
          messages,
          max_tokens: req.maxTokens,
          temperature: req.temperature,
          ...(req.tools.length
            ? {
                tools: req.tools.map((t) => ({
                  type: 'function',
                  function: { name: t.name, description: t.description, parameters: t.parameters },
                })),
                tool_choice: 'auto',
              }
            : {}),
        }),
        signal: req.signal,
      });

      if (!res.ok) {
        throw new Error(`${id} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }

      const json = (await res.json()) as {
        choices?: {
          finish_reason?: string;
          message?: {
            content?: string | null;
            tool_calls?: { id: string; function: { name: string; arguments: string } }[];
          };
        }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const choice = json.choices?.[0];
      const message = choice?.message;
      const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function.name,
        // A model can emit malformed JSON; an empty object lets the Zod check
        // reject it cleanly instead of throwing here.
        arguments: safeParse(c.function.arguments),
      }));

      return {
        text: message?.content ?? null,
        toolCalls,
        // Reasoning models (deepseek-v4-*, o-series) spend the budget thinking
        // BEFORE writing anything, so a tight max_tokens produces an empty
        // `content` with finish_reason "length". Surfacing that distinctly is
        // what stops it being logged as "the model refused" — the real cause is
        // a token ceiling, and only the ceiling can fix it.
        truncated: choice?.finish_reason === 'length',
        usage: {
          promptTokens: json.usage?.prompt_tokens ?? 0,
          completionTokens: json.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
