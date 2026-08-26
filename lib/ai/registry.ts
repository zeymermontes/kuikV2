import { openAiCompatible } from './providers/openai-compatible';
import { anthropic } from './providers/anthropic';
import type { AIProvider, ProviderId } from './types';

interface Entry {
  provider: AIProvider;
  defaultModel: string;
  /** Env var holding Kuik's own key for this provider. */
  envKey: string;
}

/**
 * Gemini is reached through its OpenAI-compatibility endpoint, which keeps it
 * on the shared adapter. Worth watching: that layer has historically been
 * uneven on tool calling, so treat Gemini + tools as unproven until tested
 * against a real key rather than promising it.
 */
export const REGISTRY: Record<ProviderId, Entry> = {
  deepseek: {
    provider: openAiCompatible('deepseek', 'https://api.deepseek.com/v1'),
    defaultModel: 'deepseek-chat',
    envKey: 'AI_DEEPSEEK_KEY',
  },
  openai: {
    provider: openAiCompatible('openai', 'https://api.openai.com/v1'),
    defaultModel: 'gpt-4o-mini',
    envKey: 'AI_OPENAI_KEY',
  },
  kimi: {
    provider: openAiCompatible('kimi', 'https://api.moonshot.ai/v1'),
    defaultModel: 'moonshot-v1-8k',
    envKey: 'AI_KIMI_KEY',
  },
  gemini: {
    provider: openAiCompatible('gemini', 'https://generativelanguage.googleapis.com/v1beta/openai'),
    defaultModel: 'gemini-2.0-flash',
    envKey: 'AI_GEMINI_KEY',
  },
  anthropic: {
    provider: anthropic,
    defaultModel: 'claude-sonnet-4-5',
    envKey: 'AI_ANTHROPIC_KEY',
  },
};

export const PROVIDER_IDS = Object.keys(REGISTRY) as ProviderId[];
