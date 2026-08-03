/**
 * services/ai/IAiProvider.ts
 *
 * Provider-agnostic interface for AI / LLM providers.
 * Implementations wrap OpenAI, Anthropic, or any other LLM API.
 */

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  messages: AiMessage[];
  /**
   * Maximum tokens to generate.
   * Default is provider-specific; set this for predictable cost control.
   */
  maxTokens?: number;
  /**
   * Temperature (0–2).
   * Lower = more deterministic.  For fraud classification, use 0.0–0.2.
   */
  temperature?: number;
}

export interface AiCompletionResponse {
  /** The generated text */
  content: string;
  /** Provider identifier for audit logging */
  provider: string;
  /** Model identifier used (e.g. "gpt-4o-mini") */
  model: string;
  /** Approximate input tokens consumed */
  inputTokens: number | null;
  /** Approximate output tokens consumed */
  outputTokens: number | null;
}

export interface IAiProvider {
  /** Human-readable provider name (e.g. "openai", "anthropic") */
  readonly name: string;

  /**
   * Send a chat completion request to the underlying LLM.
   * Implementations should handle retries for transient network errors.
   */
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;

  /**
   * Return true if this provider is configured and healthy.
   * Used by AiService to select a fallback provider.
   */
  isAvailable(): boolean;
}
