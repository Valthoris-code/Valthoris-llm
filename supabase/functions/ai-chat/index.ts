/**
 * Supabase Edge Function — `ai-chat`
 *
 * Real backend for the Valthoris AI Security Assistant.
 *
 * The browser must never hold an LLM API key, so the assistant calls this
 * function instead. The provider selection mirrors `src/services/src/config`
 * (AI_PROVIDER + OPENAI_* / ANTHROPIC_*) so a single set of secrets configures
 * both the fraud worker and the assistant.
 *
 * Required secrets (set with `supabase secrets set …`):
 *   AI_PROVIDER       — "openai" (default) or "anthropic"
 *   OPENAI_API_KEY    — required when the resolved provider is openai
 *   ANTHROPIC_API_KEY — required when the resolved provider is anthropic
 * Optional:
 *   OPENAI_MODEL      — default "gpt-4o-mini"
 *   ANTHROPIC_MODEL   — default "claude-3-5-haiku-20241022"
 *
 * The function never fabricates an answer: when no provider is configured or
 * the upstream call fails it returns a non-2xx response with a real error
 * message so the UI can show it.
 */

// deno-lint-ignore-file no-explicit-any

import { detectArtifact } from './artifacts.ts';
import {
  isPipelineConfigured,
  parseStructuredAnalysis,
  recordSecurityAnalysis,
} from './pipeline.ts';
import type { PipelineOutcome, StructuredAnalysis } from './pipeline.ts';

type Role = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: Role;
  content: string;
}

interface ChatRequest {
  messages?: ChatMessage[];
  /**
   * Internet Identity principal of the caller, used only to attribute the
   * resulting fraud event. It is metadata: it grants no privilege whatsoever
   * and is never used for authorization.
   */
  principal?: string;
}

const SYSTEM_PROMPT = [
  'You are the VALTHORIS AI Security Assistant.',
  'You help users identify phishing, scams, fraud, malware and other online threats.',
  'Answer concisely and practically. When you are not certain, say so explicitly',
  'and recommend verification steps. Never invent breach data, wallet balances',
  'or scan results you have not been given.',
].join(' ');

/**
 * Prompt used for the structured security analysis that feeds the fraud
 * pipeline. It mirrors the fraud-worker analyser (src/services/src/fraud-worker)
 * so both paths produce the same verdict vocabulary.
 */
const ANALYSIS_PROMPT = [
  'You are an expert fraud analyst at Valthoris, a digital safety platform.',
  'Analyse the artefact supplied by the user and produce a structured verdict.',
  'Respond ONLY with a JSON object matching this schema:',
  '{"verdict":"fraud"|"suspicious"|"legitimate"|"unknown",',
  '"confidenceScore":<integer 0-100>,',
  '"justification":"<one concise paragraph explaining your reasoning>",',
  '"riskSignals":["<signal>", ...],',
  '"recommendedAction":"<what the user should do, or null>"}',
  'Use "unknown" whenever the available information is insufficient.',
  'Never invent breach data, registration dates, balances or scan results.',
  'Do not include any prose outside the JSON object.',
].join(' ');

const MAX_MESSAGES = 30;
const MAX_CHARS = 8_000;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function env(name: string): string | undefined {
  const value = (globalThis as any).Deno?.env?.get(name);
  return value && value.length > 0 ? value : undefined;
}

function sanitize(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant' || m.role === 'system') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0,
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
}

interface Completion {
  content: string;
  provider: string;
  model: string;
}

/**
 * An error whose message is safe to return to the browser.
 *
 * Anything that is not an `AiChatError` (an unexpected runtime fault, whose
 * message may embed internal details or a stack trace) is logged server-side
 * and reported to the client as a generic failure instead.
 */
class AiChatError extends Error {}

async function callOpenAi(
  messages: ChatMessage[],
  apiKey: string,
  systemPrompt: string = SYSTEM_PROMPT,
): Promise<Completion> {
  const model = env('OPENAI_MODEL') ?? 'gpt-4o-mini';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers['Authorization'] = 'Bearer ' + apiKey;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: 800,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    console.error('[ai-chat] openai', res.status, await res.text());
    throw new AiChatError(`OpenAI request failed with HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new AiChatError('OpenAI returned an empty completion');
  }
  return { content, provider: 'openai', model: data?.model ?? model };
}

async function callAnthropic(
  messages: ChatMessage[],
  apiKey: string,
  systemPrompt: string = SYSTEM_PROMPT,
): Promise<Completion> {
  const model = env('ANTHROPIC_MODEL') ?? 'claude-3-5-haiku-20241022';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  headers['x-api-key'] = apiKey;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      system: systemPrompt,
      max_tokens: 800,
      temperature: 0.2,
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    console.error('[ai-chat] anthropic', res.status, await res.text());
    throw new AiChatError(`Anthropic request failed with HTTP ${res.status}`);
  }

  const data = await res.json();
  const content = data?.content?.[0]?.text;
  if (typeof content !== 'string' || content.length === 0) {
    throw new AiChatError('Anthropic returned an empty completion');
  }
  return { content, provider: 'anthropic', model: data?.model ?? model };
}

async function complete(
  messages: ChatMessage[],
  systemPrompt: string = SYSTEM_PROMPT,
): Promise<Completion> {
  const provider = (env('AI_PROVIDER') ?? 'openai').toLowerCase();
  const openaiKey = env('OPENAI_API_KEY');
  const anthropicKey = env('ANTHROPIC_API_KEY');

  const attempts: Array<() => Promise<Completion>> = [];
  if (provider === 'anthropic') {
    if (anthropicKey) attempts.push(() => callAnthropic(messages, anthropicKey, systemPrompt));
    if (openaiKey) attempts.push(() => callOpenAi(messages, openaiKey, systemPrompt));
  } else {
    if (openaiKey) attempts.push(() => callOpenAi(messages, openaiKey, systemPrompt));
    if (anthropicKey) attempts.push(() => callAnthropic(messages, anthropicKey, systemPrompt));
  }

  if (attempts.length === 0) {
    throw new AiChatError(
      'No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY as Supabase function secrets.',
    );
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      if (err instanceof AiChatError) {
        errors.push(err.message);
      } else {
        // Unexpected fault: keep the detail in the function logs only.
        console.error('[ai-chat] provider fault', err);
        errors.push('unexpected provider error');
      }
    }
  }
  throw new AiChatError(`All AI providers failed: ${errors.join(' | ')}`);
}

(globalThis as any).Deno?.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let payload: ChatRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const messages = sanitize(Array.isArray(payload.messages) ? payload.messages : []);
  if (messages.length === 0) {
    return json({ error: 'At least one message is required' }, 400);
  }

  let completion: Completion;
  try {
    completion = await complete(messages);
  } catch (err) {
    console.error('[ai-chat]', err);
    // Only curated messages reach the browser; unexpected faults are generic.
    const message = err instanceof AiChatError
      ? err.message
      : 'The AI backend is unavailable. Please try again later.';
    return json({ error: message }, 502);
  }

  // The assistant answered. When the turn was a real security analysis, run the
  // structured analysis as well and record it in the fraud pipeline. This is an
  // observability side-effect: it must never turn a successful answer into an
  // error, and it never invents a verdict.
  const analysis = await runFraudPipeline(messages, payload.principal);

  return json(analysis ? { ...completion, analysis } : completion, 200);
});

/**
 * Records a genuine security analysis for the last user turn.
 *
 * Returns `undefined` when the turn was not an artefact analysis (a general
 * question is answered but is not a fraud event) or when the pipeline is not
 * configured on this deployment.
 */
async function runFraudPipeline(
  messages: ChatMessage[],
  principal?: string,
): Promise<PipelineOutcome | undefined> {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return undefined;

  const artifact = detectArtifact(lastUser.content);
  if (!artifact) return undefined;

  if (!isPipelineConfigured()) {
    console.warn('[ai-chat] fraud pipeline not configured — analysis not recorded');
    return undefined;
  }

  const userId =
    typeof principal === 'string' && principal.trim().length > 0 && principal.length <= 128
      ? principal.trim()
      : null;

  try {
    return await recordSecurityAnalysis(
      userId,
      artifact,
      lastUser.content,
      async (): Promise<StructuredAnalysis> => {
        const result = await complete(
          [
            {
              role: 'user',
              content: `Artefact type: ${artifact.kind}\nArtefact: ${artifact.value}\n\nUser request:\n${lastUser.content}`,
            },
          ],
          ANALYSIS_PROMPT,
        );
        return parseStructuredAnalysis(result.content, result.provider, result.model);
      },
    );
  } catch (err) {
    // A pipeline fault is reported, not hidden — but it does not discard the
    // answer the user already received.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai-chat] fraud pipeline error', message);
    return { recorded: false, error: message };
  }
}
