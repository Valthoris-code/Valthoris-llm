/**
 * Supabase Edge Function — `ai-chat`
 *
 * Real backend for the Valthoris AI Security Assistant.
 *
 * The browser must never hold an LLM API key, so the assistant calls this
 * function instead.
 *
 * Two providers answer the turn, and either one covers for the other: Google
 * Gemini (a plain `fetch` against the Generative Language REST API, so no SDK
 * is needed under Deno) and DeepSeek. Whichever is tried first, *any* failure
 * (HTTP 402 "insufficient balance", HTTP 429 rate limit, timeout, empty
 * completion) falls through to the other one silently — the user never sees an
 * upstream error, and only learns of a failure when *both* models failed, and
 * then through a single generic message.
 *
 * Required secret (set with `supabase secrets set …`):
 *   GEMINI_API_KEY    — Google AI Studio key; the only key Valthoris needs
 * Optional:
 *   GEMINI_MODEL      — default "gemini-2.5-flash"
 *                       (e.g. "gemini-2.5-pro" or "gemini-2.5-flash-lite").
 *                       A blank, "models/"-prefixed or retired value is
 *                       tolerated: the name is normalised and, when Google
 *                       answers 404 (model retired or unknown to this key),
 *                       the call is retried on a model that is still served.
 *   DEEPSEEK_API_KEY  — when present, DeepSeek answers first (except on a turn
 *                       that needs Gemini's web search) and is also the
 *                       fallback whenever Gemini fails, without surfacing it
 *   DEEPSEEK_MODEL    — default "deepseek-chat"
 *
 * The function never fabricates an answer: when no key is configured or every
 * provider fails it returns a non-2xx response with a generic message, and the
 * technical detail is left in the function logs for the operator.
 */

// deno-lint-ignore-file no-explicit-any

import { detectArtifact } from './artifacts.ts';
import type { DetectedArtifact } from './artifacts.ts';
import {
  formatEvidence,
  gatherIntelligence,
  listSources,
  placeContactMissing,
  probeAllSources,
  probeSource,
  setIntelFailureSink,
} from './intel.ts';
import type { IntelEntity, IntelEntityKind, SourceReport } from './intel.ts';
import { writeErrorLog } from './errorLog.ts';
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
   * Server-to-server operation instead of a chat turn. The only one is
   * `intel-health`, used by the administration; it requires the service-role
   * key and never answers a browser session.
   */
  action?: string;
  /** `all`, or the id of a single source, for `intel-health`. */
  probe?: string;
  /**
   * Internet Identity principal of the caller, used only to attribute the
   * resulting fraud event. It is metadata: it grants no privilege whatsoever
   * and is never used for authorization.
   */
  principal?: string;
}

const SYSTEM_PROMPT = [
  'You are the VALTHORIS AI Security Assistant, a cybersecurity intelligence orchestrator.',
  'You help users identify phishing, scams, fraud, malware and other online threats.',
  'Always answer in the language the user wrote in (Portuguese or English).',
  'Never invent breach data, wallet balances, reputation scores or scan results:',
  'only report values that appear in the evidence block you were given, and say',
  'explicitly when something could not be confirmed.',
  'Never give an empty answer such as "be careful" or "search on Google" —',
  'analyse what you actually have.',
].join(' ');

/**
 * Additional instructions used when real external evidence was collected for
 * the turn: the answer must be a full intelligence report, not a chat reply.
 */
const INTEL_RESPONSE_FORMAT = [
  'An intelligence evidence block is included in this turn. Structure the answer with',
  'these sections (translated into the user\'s language):',
  'RESUMO / SUMMARY — two or three sentences;',
  'VEREDITO / VERDICT — one of: malicious, suspicious, inconclusive, no evidence of risk;',
  'RISCO / RISK — low, medium, high or critical, with the reason;',
  'EVIDÊNCIAS / EVIDENCE — bullet points, each attributed to the provider it came from;',
  'FONTES / SOURCES — the providers that actually returned data, with the lookup timestamp;',
  'RECOMENDAÇÕES / RECOMMENDATIONS — concrete next steps;',
  'LIMITAÇÕES / LIMITATIONS — the providers that failed or are unavailable, and what',
  'therefore could not be verified.',
  'Do not list a provider under SOURCES unless it returned data in the evidence block.',
].join(' ');

/**
 * Instructions used when the turn is a public place/business lookup rather than
 * a threat analysis: the answer is factual information, not a verdict.
 */
const PLACE_RESPONSE_FORMAT = [
  'This turn is a factual question about a real public place or business, not a threat analysis.',
  'Answer with these fields, in the user\'s language, one per line, and never leave one out:',
  'NOME / NAME — the official name of the place;',
  'MORADA / ADDRESS — the full postal address;',
  'CONTACTO / CONTACT — the phone number;',
  'SITE / WEBSITE — the official site, when there is one;',
  'MAPA / MAP — the OpenStreetMap link from the evidence, written in full so it is clickable;',
  'FONTES / SOURCES — every source that actually answered, each with its lookup date and time.',
  'The gazetteer often has no phone number. When a detail is missing from the evidence block,',
  'use the web search results available in this turn and cite the page you took it from.',
  'If it is still not available, write "não confirmado" / "not confirmed" on that line.',
  'Never invent a phone number, an address, a website or an opening time, and never present a',
  'value as confirmed by a source that did not return it.',
  'Do not use the threat-report sections (VERDICT, RISK) for this kind of question.',
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

/**
 * Instructions used when NO external source was consulted for the turn.
 *
 * Answering a factual question (an address, a phone number, an opening time, a
 * price) from the model's own memory is the failure mode this block exists to
 * stop: the answer may happen to be right today and be silently wrong
 * tomorrow, and the user cannot tell the two apart. When nothing was looked up,
 * the answer must say so.
 */
const UNGROUNDED_RESPONSE_FORMAT = [
  'No external source was consulted for this turn: no evidence block is present.',
  'You may answer from general knowledge, but you must not present time-sensitive facts',
  '(addresses, phone numbers, opening hours, prices, balances, reputation scores, current',
  'events) as verified. When the question asks for such a fact, state plainly, in the',
  'user\'s language, that it was not confirmed in real time by any source, and say which',
  'concrete detail the user should supply so it can be verified (for example the full name',
  'and the town of the place, or the exact address, URL, wallet or number).',
  'Never write that you consulted, searched or verified anything in this turn.',
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
  /** Public web pages the model's search tool actually consulted, when used. */
  webSources?: WebSource[];
}

interface WebSource {
  title?: string;
  uri: string;
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

/** Raised when Google answers 404 for one model name, so the next can be tried. */
class GeminiModelNotFound extends Error {}

/**
 * Raised when Google rejects the request *because of the search tool*, so the
 * turn can be retried without it instead of failing.
 */
class GeminiToolUnsupported extends Error {}

/** Model used when `GEMINI_MODEL` is unset, blank or unusable. */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Models tried, in order, when the configured one answers 404.
 *
 * Google retires model names (the previous default, `gemini-1.5-flash`, is no
 * longer served on v1beta and answers `404 NOT_FOUND`), which surfaced in the
 * app as "Gemini request failed with HTTP 404". A 404 is not a transient
 * upstream failure: it means *this* name does not exist for *this* key, so the
 * call is retried once on a name that is still served instead of failing the
 * whole conversation.
 */
const GEMINI_FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

/**
 * Normalises the configured model name.
 *
 * The secret is written by a human, so it may carry surrounding whitespace, a
 * trailing slash or the fully-qualified `models/<name>` form copied from the
 * Google docs. Left as-is, `models/gemini-2.5-flash` is percent-encoded into
 * the path segment and Google answers 404. Anything that is not a plausible
 * model id falls back to the default rather than building a broken URL.
 */
function resolveGeminiModel(): string {
  const configured = env('GEMINI_MODEL');
  if (!configured) return DEFAULT_GEMINI_MODEL;
  const cleaned = configured.trim().replace(/^\/+|\/+$/g, '').replace(/^models\//, '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(cleaned)) return DEFAULT_GEMINI_MODEL;
  return cleaned;
}

/** The ordered list of models to try: the configured one first, then fallbacks. */
function geminiModelChain(): string[] {
  const chain = [resolveGeminiModel()];
  for (const fallback of GEMINI_FALLBACK_MODELS) {
    if (!chain.includes(fallback)) chain.push(fallback);
  }
  return chain;
}

/**
 * Google Gemini — the provider that also serves the web-search tool.
 *
 * The REST API expects the key in the `key` query-string parameter of the
 * `:generateContent` endpoint.
 */
async function callGemini(
  messages: ChatMessage[],
  apiKey: string,
  systemPrompt: string = SYSTEM_PROMPT,
  webSearch = false,
): Promise<Completion> {
  const chain = geminiModelChain();
  let lastNotFound: AiChatError | undefined;
  for (const model of chain) {
    try {
      return await callGeminiModel(messages, apiKey, systemPrompt, model, webSearch);
    } catch (err) {
      if (err instanceof GeminiToolUnsupported) {
        // The deployment's model or API version does not serve the search tool.
        // The Nominatim evidence is still in the turn, so it is retried without
        // the tool rather than lost.
        console.warn('[ai-chat] gemini google_search unavailable — retrying without it');
        return await callGeminiModel(messages, apiKey, systemPrompt, model, false);
      }
      if (err instanceof GeminiModelNotFound) {
        lastNotFound = new AiChatError(
          `Gemini model "${model}" is not available for this API key (HTTP 404). ` +
            'Set the GEMINI_MODEL secret to a model your key can serve.',
        );
        continue;
      }
      throw err;
    }
  }
  throw lastNotFound ??
    new AiChatError('Gemini request failed: no model could be reached.');
}

async function callGeminiModel(
  messages: ChatMessage[],
  apiKey: string,
  systemPrompt: string,
  model: string,
  webSearch = false,
): Promise<Completion> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            // Gemini names the assistant turn "model".
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        // Google's own web search, enabled only for the turns that need a
        // detail the configured providers do not carry (a business phone
        // number, typically). It is what makes the answer a real lookup rather
        // than a recollection.
        ...(webSearch ? { tools: [{ google_search: {} }] } : {}),
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
    // A 400 on a request that carries the search tool is, in practice, that
    // tool not being served for this model: retry without it instead of
    // failing the turn. An unrelated 400 (malformed body, quota) simply
    // reproduces on the retry and is surfaced then, so nothing is masked.
    if (res.status === 400 && webSearch) throw new GeminiToolUnsupported(model);
    // A 404 identifies the model, not the request: let the caller try the next
    // name in the chain before giving up.
    if (res.status === 404) throw new GeminiModelNotFound(model);
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
  const webSources = groundingSources(data);
  return {
    content,
    provider: 'gemini',
    model: data?.modelVersion ?? model,
    ...(webSources.length > 0 ? { webSources } : {}),
  };
}

/**
 * The pages the search tool actually consulted, taken from Google's grounding
 * metadata. Nothing is inferred: an answer with no grounding chunks lists no
 * web source.
 */
function groundingSources(data: any): WebSource[] {
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const seen = new Set<string>();
  const sources: WebSource[] = [];
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    if (typeof uri !== 'string' || uri.length === 0 || seen.has(uri)) continue;
    seen.add(uri);
    const title = chunk?.web?.title;
    sources.push({
      uri: uri.slice(0, 500),
      ...(typeof title === 'string' && title.length > 0 ? { title: title.slice(0, 200) } : {}),
    });
    if (sources.length >= 8) break;
  }
  return sources;
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

/**
 * DeepSeek — used whenever `DEEPSEEK_API_KEY` is set: first (as a cost
 * optimisation) on an ordinary turn, and as the fallback when Gemini fails.
 *
 * It is never a dependency: any failure at all (network, quota, HTTP
 * 401/402/429/5xx, empty completion) falls back silently to Gemini. The user is
 * never shown a DeepSeek error.
 */
async function callDeepSeek(
  messages: ChatMessage[],
  apiKey: string,
  systemPrompt: string,
): Promise<Completion> {
  const model = env('DEEPSEEK_MODEL') ?? 'deepseek-chat';
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.2,
      max_tokens: 800,
    }),
  });
  if (!res.ok) {
    // Status only: the body can echo the request. Nothing here reaches the
    // browser — the caller falls back to Gemini.
    throw new Error(`DeepSeek request failed with HTTP ${res.status}`);
  }
  const data = await res.json();
  const content = typeof data?.choices?.[0]?.message?.content === 'string'
    ? data.choices[0].message.content.trim()
    : '';
  if (content.length === 0) throw new Error('DeepSeek returned an empty completion');
  return { content, provider: 'deepseek', model: data?.model ?? model };
}

/**
 * The only model failure the user ever sees.
 *
 * Every upstream detail (HTTP 429 rate limit, HTTP 402 insufficient balance,
 * timeouts, a missing secret) is an operator concern: it is logged server-side
 * and replaced here, so a raw "… request failed with HTTP 429" never reaches
 * the conversation.
 */
const PROVIDERS_UNAVAILABLE =
  'De momento não consigo processar o seu pedido, tente novamente em instantes.';

/**
 * Answers the turn with whichever provider is available.
 *
 * Neither provider is a dependency of the other: the configured providers are
 * tried in order and *any* failure (HTTP 402/429/5xx, network, timeout, empty
 * completion) falls through to the next one silently. DeepSeek is tried first
 * as a cost optimisation, except on a turn that needs Google's web-search tool
 * — DeepSeek has none, and answering such a turn from the model's memory would
 * be exactly the guess that feature exists to avoid.
 *
 * The user only ever learns of a failure when *every* provider failed, and
 * then only through `PROVIDERS_UNAVAILABLE`.
 */
async function complete(
  messages: ChatMessage[],
  systemPrompt: string = SYSTEM_PROMPT,
  webSearch = false,
): Promise<Completion> {
  const geminiKey = env('GEMINI_API_KEY');
  const deepSeekKey = env('DEEPSEEK_API_KEY');

  const providers: { name: string; call: () => Promise<Completion> }[] = [];
  const gemini = geminiKey
    ? { name: 'gemini', call: () => callGemini(messages, geminiKey, systemPrompt, webSearch) }
    : undefined;
  const deepSeek = deepSeekKey
    ? { name: 'deepseek', call: () => callDeepSeek(messages, deepSeekKey, systemPrompt) }
    : undefined;

  if (deepSeek && !(webSearch && gemini)) {
    providers.push(deepSeek);
    if (gemini) providers.push(gemini);
  } else {
    if (gemini) providers.push(gemini);
    if (deepSeek) providers.push(deepSeek);
  }

  if (providers.length === 0) {
    console.error(
      '[ai-chat] no AI provider configured — set GEMINI_API_KEY (or DEEPSEEK_API_KEY) ' +
        'as a Supabase function secret',
    );
    throw new AiChatError(PROVIDERS_UNAVAILABLE);
  }

  for (const [index, provider] of providers.entries()) {
    try {
      return await provider.call();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const next = providers[index + 1];
      if (next) {
        // Logged for the operator, invisible to the user: the other model answers.
        console.warn(
          `[ai-chat] ${provider.name} unavailable, falling back to ${next.name}:`,
          detail,
        );
      } else {
        // Every provider failed: the loop ends and the generic error is thrown.
        console.error(`[ai-chat] ${provider.name} unavailable, no provider left:`, detail);
      }
    }
  }

  throw new AiChatError(PROVIDERS_UNAVAILABLE);
}

// Every intelligence provider failure is recorded with its real cause. The user
// keeps seeing one generic sentence; the operator gets the HTTP status, the
// provider and the timestamp in `governance.error_logs`.
setIntelFailureSink((failure) => {
  void writeErrorLog({
    source: 'ai-chat/intel',
    severity: failure.status === 429 ? 'WARNING' : 'ERROR',
    message: `Intel source ${failure.provider} (${failure.endpoint}) failed`,
    detail: failure.message,
    context: {
      provider: failure.provider,
      endpoint: failure.endpoint,
      ...(failure.status ? { httpStatus: failure.status } : {}),
    },
  });
});

/**
 * Constant-time comparison of two secrets.
 *
 * The health endpoint is authorised by a shared key; comparing with `===`
 * would leak its prefix through the time the comparison takes.
 */
function secretEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Server-to-server health check of the intelligence sources.
 *
 * It is what the administration's "state of the sources" panel reads, so it is
 * never reachable from a browser session: the caller must present this
 * project's service-role key, which only another Edge Function holds.
 * `probe` runs a real lookup against one source (or all of them); without it
 * only the configured state is reported and no provider is contacted.
 */
async function handleIntelHealth(req: Request, probe: unknown): Promise<Response> {
  const expected = env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SERVICE_ROLE_KEY');
  const presented = req.headers.get('x-valthoris-service-key') ?? '';
  if (!expected || !presented || !secretEquals(presented, expected)) {
    // Same answer as an unknown route: the endpoint does not advertise itself.
    return json({ error: 'Not found' }, 404);
  }

  if (probe === 'all') {
    return json({ sources: await probeAllSources(), probedAt: new Date().toISOString() }, 200);
  }
  if (typeof probe === 'string' && probe.length > 0 && probe.length <= 120) {
    const result = await probeSource(probe);
    if (!result) return json({ error: 'Unknown source' }, 404);
    return json({ sources: [result], probedAt: new Date().toISOString() }, 200);
  }
  return json({ sources: listSources(), probedAt: null }, 200);
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

  if ((payload as any)?.action === 'intel-health') {
    return await handleIntelHealth(req, (payload as any)?.probe);
  }

  const messages = sanitize(Array.isArray(payload.messages) ? payload.messages : []);
  if (messages.length === 0) {
    return json({ error: 'At least one message is required' }, 400);
  }

  // ─── Intelligence orchestration ───────────────────────────────────────────
  // Before the model answers, the entity in the last user turn (if any) is
  // enriched with the external providers configured for this deployment. The
  // model then reasons over real data instead of its own recollection.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const artifact = lastUser ? detectArtifact(lastUser.content) : null;
  const intel = lastUser ? await collectIntelligence(lastUser.content, artifact) : null;

  const modelMessages = intel && intel.evidence
    ? [
        ...messages.slice(0, -1),
        {
          role: 'user' as const,
          content: `${messages[messages.length - 1].content}\n\n---\n${intel.evidence}`,
        },
      ]
    : messages;
  const grounded = Boolean(intel && intel.evidence);
  const systemPrompt = intel && intel.evidence
    ? `${SYSTEM_PROMPT} ${intel.kind === 'place' ? PLACE_RESPONSE_FORMAT : INTEL_RESPONSE_FORMAT}`
    : `${SYSTEM_PROMPT} ${UNGROUNDED_RESPONSE_FORMAT}`;

  // Nominatim locates a business but frequently carries no phone number. When
  // that happens on a place turn, Google's own web search is enabled so the
  // contact comes from a real page instead of the model's memory.
  const webSearch = intel?.kind === 'place' && placeContactMissing(intel.sources);

  let completion: Completion;
  try {
    completion = await complete(modelMessages, systemPrompt, webSearch);
  } catch (err) {
    console.error('[ai-chat]', err);
    // Only curated messages reach the browser; unexpected faults are generic.
    const message = err instanceof AiChatError ? err.message : PROVIDERS_UNAVAILABLE;
    return json({ error: message }, err instanceof AiChatError ? err.status : 502);
  }

  // The assistant answered. When the turn was a real security analysis, run the
  // structured analysis as well and record it in the fraud pipeline. This is an
  // observability side-effect: it must never turn a successful answer into an
  // error, and it never invents a verdict.
  const analysis = await runFraudPipeline(messages, payload.principal);

  // The web search, when it ran and actually consulted pages, is a source like
  // any other: it is listed with its own timestamp and the pages it read.
  const sources = [...(intel?.sources ?? [])];
  if (completion.webSources && completion.webSources.length > 0) {
    sources.push({
      provider: 'Google Search (Gemini)',
      endpoint: 'web/search',
      entity: intel?.entity ?? '',
      timestamp: new Date().toISOString(),
      status: 'success',
      data: { pages: completion.webSources },
    });
  }

  const { webSources: _webSources, ...answer } = completion;
  return json(
    {
      ...answer,
      // Whether the answer stands on evidence collected in this very turn. The
      // UI shows it, so a user is never left guessing if a reply was verified.
      grounded: grounded || sources.some((s) => s.status === 'success'),
      ...(analysis ? { analysis } : {}),
      ...(sources.length > 0 ? { sources } : {}),
    },
    200,
  );
}

/**
 * Public-place lookup: the entity being asked about.
 *
 * Either an explicit kind of establishment, or the "X em/no/na/de Y" shape that
 * names a place ("hospital de Évora", "clínica no Porto").
 */
const PLACE_ENTITY_RE =
  /\b(restaurante|loja|[óo]ptica|[óo]tica|hospital|centro de sa[úu]de|escola|universidade|hotel|empresa|cl[íi]nica|banco|farm[áa]cia|caf[ée]|padaria|gin[áa]sio|oficina|est[úa]dio|museu|restaurant|shop|store|clinic|pharmacy|school|company|hotel)\b/i;

const PLACE_PATTERN_RE =
  /\b\p{L}[\p{L}.'-]{2,}\s+(?:em|no|na|nos|nas|d[oa]s?|de|in|at)\s+\p{Lu}[\p{L}.'-]{2,}/u;

/**
 * Public-place lookup: the factual request being made about it.
 *
 * A place lookup only runs when a factual detail is actually asked for, so a
 * greeting or generic chat never triggers an external search.
 */
const PLACE_REQUEST_RE =
  /\b(contact[oa]s?|telefone|telem[óo]vel|n[úu]mero|morada|endere[çc]o|onde\s+(?:fica|é|e|está|esta)|hor[áa]rio|hor[áa]rios|localiza[çc][ãa]o|site|website|p[áa]gina|quem\s+é\s+(?:esta|essa|a)\s+empresa|phone|address|opening hours|where is|contact)\b/i;

/**
 * Public-place lookup: a practical need that can only be answered on the map.
 *
 * The lookup used to depend on the user phrasing an explicit question
 * ("morada", "contacto", "onde fica"). "McDonald's em Évora, estou com fome,
 * preciso de comer" contains none of those words, so nothing was looked up and
 * the assistant answered a real-world location question from the language
 * model's memory — right by luck, and unverifiable. Wanting to eat, to get
 * there or to find the nearest one is the same request in plain language, and
 * it must reach the map just the same.
 */
const PLACE_NEED_RE =
  /\b(fome|comer|almo[çc]ar|jantar|lanchar|beber|caf[ée]|refei[çc][ãa]o|dormir|ficar|abastecer|combust[íi]vel|farm[áa]cia\s+de\s+servi[çc]o|perto\s+de\s+mim|mais\s+pr[óo]xim[oa]|aqui\s+perto|nas?\s+redondezas|como\s+(?:chego|chegar|ir)|ir\s+at[ée]|dire[çc][õo]es|rota|caminho|mapa|hungry|eat|nearby|nearest|near\s+me|how\s+do\s+i\s+get|directions|route|map)\b/i;

/**
 * True when the turn is genuinely about a real public place or business.
 *
 * A place must be named — an establishment type ("restaurante", "farmácia") or
 * the "X em Y" shape — *and* the turn must express either a factual question
 * about it or a practical need that only a location can satisfy. "Olá", "bom
 * dia" or "obrigado" satisfy neither, so they still never reach an external
 * provider.
 */
export function isPlaceLookup(text: string): boolean {
  const hasEntity = PLACE_ENTITY_RE.test(text) || PLACE_PATTERN_RE.test(text);
  if (!hasEntity) return false;
  return PLACE_REQUEST_RE.test(text) || PLACE_NEED_RE.test(text);
}

/**
 * Words that describe the request rather than the place, dropped from the query.
 *
 * Nominatim searches a gazetteer, not free text: "McDonald's em Évora estou com
 * fome preciso de comer" finds nothing, while "McDonald's Évora" finds the
 * restaurant. Everything that expresses the need rather than the place is
 * removed before the search.
 */
const PLACE_QUERY_NOISE_RE =
  /\b(qual\s+é|qual|quero|queria|gostava|preciso|sabes|podes|dizer|diz-me|d[áa]-me|indica(?:-me)?|por favor|o\s+contact[oa]s?|contact[oa]s?|n[úu]mero de telefone|n[úu]mero|telefone|telem[óo]vel|morada|endere[çc]o|hor[áa]rio(?:s)?|localiza[çc][ãa]o|onde\s+(?:fica|é|e|está|esta)|estou\s+com\s+fome|com\s+fome|fome|comer|almo[çc]ar|jantar|lanchar|beber|dormir|abastecer|perto\s+de\s+mim|mais\s+pr[óo]xim[oa]|aqui\s+perto|nas?\s+redondezas|como\s+(?:chego|chegar|ir)|dire[çc][õo]es|rota|caminho|mapa|what\s+is|i\s+am\s+hungry|hungry|near\s+me|nearest|nearby|directions|route|map|the\s+)\b/gi;

/** Builds the Nominatim query from the turn: the place, without the question. */
export function placeQuery(text: string): string {
  const cleaned = text
    .replace(/[?¿!¡]/g, ' ')
    .replace(PLACE_QUERY_NOISE_RE, ' ')
    .replace(/^\s*(?:d[oa]s?|de|d[oa]|em|no|na)\s+/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned.length >= 3 ? cleaned : text.trim()).slice(0, 200);
}

/** Chat turns that justify a live current-threat news lookup. */
const NEWS_INTENT_RE =
  /\b(latest|recent|current|news|trend|campaign|outbreak|zero[- ]day|ultim[oa]s?|recentes?|not[ií]cias?|atual(?:idade)?|amea[çc]as?|tend[êe]ncias?)\b/i;

/** Maps a detected artefact to the entity kind the orchestrator understands. */
function intelEntityFor(artifact: DetectedArtifact): IntelEntity | null {
  const kindMap: Record<string, IntelEntityKind> = {
    url: 'url',
    domain: 'domain',
    email: 'email',
    iban: 'iban',
    phone: 'phone',
    ip: 'ip',
  };
  if (artifact.kind === 'crypto') {
    return {
      kind: /^0x[a-fA-F0-9]{40}$/.test(artifact.value) ? 'crypto_eth' : 'crypto_btc',
      value: artifact.value,
    };
  }
  const kind = kindMap[artifact.kind];
  return kind ? { kind, value: artifact.value } : null;
}

/**
 * Collects external intelligence for the turn.
 *
 * Returns the per-provider reports (shown to the user as sources) and the
 * evidence block handed to the model. A turn with no analysable entity and no
 * current-threat intent produces no lookup at all.
 */
async function collectIntelligence(
  userText: string,
  artifact: DetectedArtifact | null,
): Promise<
  { kind: IntelEntityKind; entity: string; sources: SourceReport[]; evidence: string | null } | null
> {
  let entity: IntelEntity | null = artifact ? intelEntityFor(artifact) : null;
  if (!entity && isPlaceLookup(userText)) {
    entity = { kind: 'place', value: placeQuery(userText) };
  }
  if (!entity && NEWS_INTENT_RE.test(userText)) {
    entity = { kind: 'topic', value: userText.slice(0, 200) };
  }
  if (!entity) return null;

  let sources: SourceReport[];
  try {
    sources = await gatherIntelligence(entity);
  } catch (err) {
    // The orchestrator itself must never break the conversation.
    console.error('[ai-chat] intelligence orchestration failed', err);
    return null;
  }
  if (sources.length === 0) return null;

  const usable = sources.some((s) => s.status !== 'not_configured');
  return {
    kind: entity.kind,
    entity: entity.value,
    sources,
    evidence: usable ? formatEvidence(entity, sources) : null,
  };
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
