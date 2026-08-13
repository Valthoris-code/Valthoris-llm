/**
 * Supabase Edge Function — `ai-chat`
 *
 * Real backend for the Valthoris AI Security Assistant.
 *
 * The browser must never hold an LLM API key, so the assistant calls this
 * function instead.
 *
 * Google Gemini is the only provider: there is no OpenAI/Anthropic dependency
 * and no failover to another vendor. The call is a plain `fetch` against the
 * Google Generative Language REST API, so no SDK is needed under Deno.
 *
 * Required secret (set with `supabase secrets set …`):
 *   GEMINI_API_KEY    — Google AI Studio key; the only key Valthoris needs
 * Optional:
 *   GEMINI_MODEL      — default "gemini-2.0-flash"
 *                       (e.g. "gemini-1.5-flash" or "gemini-1.5-pro")
 *
 * The function never fabricates an answer: when the key is missing or the
 * upstream call fails it returns a non-2xx response with a real error message
 * so the UI can show it.
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
class AiChatError extends Error {
  /** HTTP status to answer with; defaults to 502 (upstream failure). */
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/**
 * Google Gemini — the only provider.
 *
 * The key is passed in the `x-goog-api-key` header (never in the query string,
 * where it would end up in proxy and server logs).
 */
async function callGemini(
  messages: ChatMessage[],
  apiKey: string,
  systemPrompt: string = SYSTEM_PROMPT,
): Promise<Completion> {
  const model = env('GEMINI_MODEL') ?? 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            // Gemini names the assistant turn "model".
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
      }),
    },
  );

  if (!res.ok) {
    // The upstream body can echo the request; it never reaches the browser…
    const body = await res.text();
    console.error('[ai-chat] gemini', res.status, body);
    // …except for an authentication failure, where Google's own message is the
    // only thing that tells the operator which key or restriction is wrong. It
    // describes the credential, not the prompt, so it is safe to return.
    if (res.status === 401 || res.status === 403) {
      throw new AiChatError(
        `Gemini authentication failed (HTTP ${res.status}): ${googleErrorMessage(body)}`,
        res.status,
      );
    }
    throw new AiChatError(`Gemini request failed with HTTP ${res.status}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const content = Array.isArray(parts)
    ? parts.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('').trim()
    : '';
  if (content.length === 0) {
    const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason;
    throw new AiChatError(
      reason
        ? `Gemini returned an empty completion (${String(reason)})`
        : 'Gemini returned an empty completion',
    );
  }
  return { content, provider: 'gemini', model: data?.modelVersion ?? model };
}

/** Extracts the native `error.message` Google returns, falling back to its status text. */
function googleErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message;
    if (typeof message === 'string' && message.length > 0) {
      return message.slice(0, 500);
    }
    const status = parsed?.error?.status;
    if (typeof status === 'string' && status.length > 0) return status;
  } catch {
    // Not JSON: do not echo an arbitrary upstream body to the browser.
  }
  return 'the Google API returned no error detail. Check the GEMINI_API_KEY secret.';
}

async function complete(
  messages: ChatMessage[],
  systemPrompt: string = SYSTEM_PROMPT,
): Promise<Completion> {
  const geminiKey = env('GEMINI_API_KEY');
  if (!geminiKey) {
    throw new AiChatError(
      'No AI provider configured. Set GEMINI_API_KEY as a Supabase function secret.',
    );
  }
  return await callGemini(messages, geminiKey, systemPrompt);
}

/** HTTP entry point. Exported so it can be exercised by the function tests. */
export async function handleRequest(req: Request): Promise<Response> {
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
    return json({ error: message }, err instanceof AiChatError ? err.status : 502);
  }

  // The assistant answered. When the turn was a real security analysis, run the
  // structured analysis as well and record it in the fraud pipeline. This is an
  // observability side-effect: it must never turn a successful answer into an
  // error, and it never invents a verdict.
  const analysis = await runFraudPipeline(messages, payload.principal);

  return json(analysis ? { ...completion, analysis } : completion, 200);
}

(globalThis as any).Deno?.serve(handleRequest);

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
