/**
 * AI Assistant service.
 *
 * The assistant talks to the `ai-chat` Supabase Edge Function
 * (supabase/functions/ai-chat), which holds the LLM credentials. The browser
 * never sees an API key, and the function is the single place where the
 * provider (OpenAI / Anthropic) is selected.
 *
 * Required browser configuration:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Required Edge Function secrets:
 *   AI_PROVIDER, OPENAI_API_KEY and/or ANTHROPIC_API_KEY
 *
 * Every failure is thrown as a real Error — the UI must show it instead of a
 * fabricated answer.
 */

import { getSupabase, isSupabaseConfigured, SUPABASE_CONFIG_ERROR } from './supabaseClient';

export const AI_FUNCTION_NAME = 'ai-chat';

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatReply {
  content: string;
  provider: string;
  model: string;
}

/** True when the browser has the configuration required to reach the backend. */
export const isAiBackendConfigured = isSupabaseConfigured;

export const AI_BACKEND_CONFIG_ERROR =
  `${SUPABASE_CONFIG_ERROR} The AI Assistant reaches its backend through the ` +
  `"${AI_FUNCTION_NAME}" Supabase Edge Function.`;

/** Extracts a human-readable message from an Edge Function error response. */
async function readFunctionError(error: unknown): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (body && typeof body.error === 'string') return body.error;
    } catch {
      try {
        const text = await context.clone().text();
        if (text) return text;
      } catch {
        // fall through to the generic message below
      }
    }
    return `AI backend returned HTTP ${context.status}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sends the conversation to the AI backend and returns the assistant reply.
 * Throws when the backend is unreachable, unconfigured or returns an error.
 */
export async function sendChat(messages: AiChatMessage[]): Promise<AiChatReply> {
  if (!isAiBackendConfigured) {
    throw new Error(AI_BACKEND_CONFIG_ERROR);
  }

  const { data, error } = await getSupabase().functions.invoke<AiChatReply | { error: string }>(
    AI_FUNCTION_NAME,
    { body: { messages } },
  );

  if (error) {
    throw new Error(await readFunctionError(error));
  }
  if (!data) {
    throw new Error('AI backend returned an empty response');
  }
  if ('error' in data && typeof data.error === 'string') {
    throw new Error(data.error);
  }
  const reply = data as AiChatReply;
  if (typeof reply.content !== 'string' || reply.content.length === 0) {
    throw new Error('AI backend returned an empty completion');
  }
  return reply;
}
