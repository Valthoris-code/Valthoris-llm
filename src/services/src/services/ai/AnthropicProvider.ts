/**
 * services/ai/AnthropicProvider.ts
 *
 * Anthropic (Claude) implementation of IAiProvider.
 * Uses the official `@anthropic-ai/sdk` npm package.
 *
 * TODO: Set ANTHROPIC_API_KEY in your environment.
 * TODO: Adjust model and request parameters to match your usage tier.
 */

import Anthropic from '@anthropic-ai/sdk';
import { AiCompletionRequest, AiCompletionResponse, IAiProvider, AiMessage } from './IAiProvider';

export class AnthropicProvider implements IAiProvider {
  readonly name = 'anthropic';

  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model = 'claude-3-5-haiku-20241022') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  isAvailable(): boolean {
    return Boolean(this.client);
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    // Anthropic separates the system prompt from the conversation messages
    const systemMessages = request.messages.filter((m) => m.role === 'system');
    const userMessages: AiMessage[] = request.messages.filter((m) => m.role !== 'system');

    const systemPrompt =
      systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join('\n\n')
        : undefined;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxTokens ?? 512,
      system: systemPrompt,
      messages: userMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Anthropic returned no text block in the response');
    }

    return {
      content: textBlock.text,
      provider: this.name,
      model: response.model,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
    };
  }
}
