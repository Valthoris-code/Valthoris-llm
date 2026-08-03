/**
 * services/ai/AiService.ts
 *
 * Provider-agnostic AI service.
 *
 * Selects the configured primary provider and transparently falls back to
 * the next available provider if the primary raises an error or is
 * unavailable.
 *
 * Usage:
 *   const ai = AiService.fromConfig(aiConfig());
 *   const response = await ai.complete({ messages: [...] });
 */

import { AiConfig, AiProviderName } from '../../config';
import { AiCompletionRequest, AiCompletionResponse, IAiProvider } from './IAiProvider';
import { OpenAiProvider } from './OpenAiProvider';
import { AnthropicProvider } from './AnthropicProvider';

export class AiService {
  private readonly providers: IAiProvider[];

  constructor(providers: IAiProvider[]) {
    if (providers.length === 0) {
      throw new Error('AiService requires at least one provider');
    }
    this.providers = providers;
  }

  /**
   * Factory method — builds an AiService from the application config.
   * Providers are ordered so that the configured primary comes first.
   */
  static fromConfig(config: AiConfig): AiService {
    const ordered = buildProviderList(config);
    if (ordered.length === 0) {
      throw new Error(
        'No AI providers could be initialised. ' +
          'Set OPENAI_API_KEY or ANTHROPIC_API_KEY in your environment.',
      );
    }
    return new AiService(ordered);
  }

  /**
   * Send a completion request, trying each provider in order until one succeeds.
   * Throws only when all providers have failed.
   */
  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const errors: string[] = [];

    for (const provider of this.providers) {
      if (!provider.isAvailable()) continue;

      try {
        return await provider.complete(request);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`[${provider.name}] ${message}`);
      }
    }

    throw new Error(
      `All AI providers failed:\n${errors.join('\n')}`,
    );
  }

  /** Returns the names of all registered providers in priority order. */
  get providerNames(): string[] {
    return this.providers.map((p) => p.name);
  }
}

// ─── Private helpers ─────────────────────────────────────────────────────

function buildProviderList(config: AiConfig): IAiProvider[] {
  const all: Array<{ name: AiProviderName; factory: () => IAiProvider | null }> = [
    {
      name: 'openai',
      factory: () =>
        config.openaiApiKey
          ? new OpenAiProvider(config.openaiApiKey, config.openaiModel)
          : null,
    },
    {
      name: 'anthropic',
      factory: () =>
        config.anthropicApiKey
          ? new AnthropicProvider(config.anthropicApiKey, config.anthropicModel)
          : null,
    },
  ];

  // Put the configured primary provider first
  const primary = config.provider;
  const sorted = [
    ...all.filter((p) => p.name === primary),
    ...all.filter((p) => p.name !== primary),
  ];

  return sorted.flatMap((entry) => {
    const provider = entry.factory();
    return provider ? [provider] : [];
  });
}
