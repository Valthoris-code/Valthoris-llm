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

type Role = 'system' | 'user' | 'assistant';

interface ChatMessage {
  role: Role;
  content: string;
}

interface ChatRequest {
  messages?: ChatMessage[];
}

const SYSTEM_PROMPT = [
  'You are the VALTHORIS AI Security Assistant.',
  'You help users identify phishing, scams, fraud, malware and other online threats.',
  'Answer concisely and practically. When you are not certain, say so explicitly',
  'and recommend verification steps. Never invent breach data, wallet balances',
  'or scan results you have not been given.',
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

async function callOpenAi(messages: ChatMessage[], apiKey: string): Promise<Completion> {
  const model = env('OPENAI_MODEL') ?? 'gpt-4o-mini';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers['Authorization'] = 'Bearer ' + apiKey;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 800,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI request failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('OpenAI returned an empty completion');
  }
  return { content, provider: 'openai', model: data?.model ?? model };
}

async function callAnthropic(messages: ChatMessage[], apiKey: string): Promise<Completion> {
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
      system: SYSTEM_PROMPT,
      max_tokens: 800,
      temperature: 0.2,
      messages: messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic request failed (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const content = data?.content?.[0]?.text;
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('Anthropic returned an empty completion');
  }
  return { content, provider: 'anthropic', model: data?.model ?? model };
}

async function complete(messages: ChatMessage[]): Promise<Completion> {
  const provider = (env('AI_PROVIDER') ?? 'openai').toLowerCase();
  const openaiKey = env('OPENAI_API_KEY');
  const anthropicKey = env('ANTHROPIC_API_KEY');

  const attempts: Array<() => Promise<Completion>> = [];
  if (provider === 'anthropic') {
    if (anthropicKey) attempts.push(() => callAnthropic(messages, anthropicKey));
    if (openaiKey) attempts.push(() => callOpenAi(messages, openaiKey));
  } else {
    if (openaiKey) attempts.push(() => callOpenAi(messages, openaiKey));
    if (anthropicKey) attempts.push(() => callAnthropic(messages, anthropicKey));
  }

  if (attempts.length === 0) {
    throw new Error(
      'No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY as Supabase function secrets.',
    );
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new Error(`All AI providers failed: ${errors.join(' | ')}`);
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

  try {
    return json(await complete(messages), 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai-chat]', message);
    return json({ error: message }, 502);
  }
});
