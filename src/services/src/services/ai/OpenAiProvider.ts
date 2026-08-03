/**
 * services/ai/OpenAiProvider.ts
 *
 * OpenAI implementation of IAiProvider.
 * Uses the official `openai` npm package.
 *
 * TODO: Set OPENAI_API_KEY in your environment.
 * TODO: Adjust model and request parameters to match your usage tier.
 */

import OpenAI from 'openai';
import { AiCompletionRequest, AiCompletionResponse, IAiProvider } from './IAiProvider';

export class OpenAiProvider implements IAiProvider {
  readonly name = 'openai';

  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  isAvailable(): boolean {
    // The client is available if the API key was supplied
    return Boolean(this.client);
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: request.maxTokens ?? 512,
      temperature: request.temperature ?? 0.1,
    });

    const choice = response.choices[0];
    if (!choice?.message?.content) {
      throw new Error('OpenAI returned an empty completion');
    }

    return {
      content: choice.message.content,
      provider: this.name,
      model: response.model,
      inputTokens: response.usage?.prompt_tokens ?? null,
      outputTokens: response.usage?.completion_tokens ?? null,
    };
  }
}
