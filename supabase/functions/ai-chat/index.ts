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
  gatherAllIntelligence,
  isValidEntity,
  listSources,
  probeAllSources,
  probeSource,
  setIntelFailureSink,
} from './intel.ts';
import type { IntelEntity, IntelEntityKind, SourceReport, WebResult } from './intel.ts';
import { writeErrorLog } from './errorLog.ts';
import {
  isPipelineConfigured,
  parseStructuredAnalysis,
  recordSecurityAnalysis,
} from './pipeline.ts';
import type { PipelineOutcome, StructuredAnalysis } from './pipeline.ts';
import { computeVerdict, isRiskKind, verdictLanguage } from './verdict.ts';
import type { LocalEvidence, Verdict, VerdictEntityKind } from './verdict.ts';

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

/**
 * A single-indicator analysis request, sent by the sidebar lookup tools.
 *
 * `local` carries what the Internet Computer canisters already answered in the
 * browser (reputation, IOC match, community reports) so the verdict is computed
 * over every piece of evidence at once, in the one place that computes it.
 */
interface AnalyseRequest {
  action: 'analyse';
  kind?: string;
  value?: string;
  local?: unknown;
  language?: string;
}

const SYSTEM_PROMPT = [
  'You are VALTHORIS, a general-purpose AI assistant with a specialty in digital security.',
  'You help with any subject the user brings — places, businesses, travel, health, law,',
  'technology, current events, everyday questions — and you also identify phishing, scams,',
  'fraud and malware.',
  'Always answer in the language the user wrote in (Portuguese or English).',
  'Speak like a warm, close, plain-spoken person: no corporate register, no jargon the user',
  'did not use, no formulaic sentence repeated from one answer to the next.',
  'Only introduce yourself as VALTHORIS on the very first message of a conversation, or when',
  'the user asks who you are — never re-introduce yourself in the middle of a conversation,',
  'and never open an answer with "Como VALTHORIS, estou aqui para ajudar…".',
  'Match the length of the answer to the message: a short or casual message gets a short,',
  'human reply of one or two sentences, with no headings, no bullet lists and no source list.',
  'What you are given is one continuous conversation: read the earlier turns and resolve what',
  'the user refers to indirectly ("a morada?", "e o contacto?", "onde fica isso?") against',
  'what was already discussed, instead of asking for the full name again or saying this is',
  'the first message of the session.',
  'Never invent breach data, wallet balances, reputation scores or scan results:',
  'only report values that appear in the evidence block you were given, and say',
  'explicitly when something could not be confirmed.',
  'Never name a source that is not in the evidence block, and never describe a database, a',
  'register or a site as consulted when it is not there: an invented citation is worse than',
  'no citation at all.',
  'Never give an empty answer such as "be careful" or "search on Google" —',
  'answer with what you actually have, and never refuse a question merely because it is',
  'not about security.',
].join(' ');

/**
 * Marker that separates the plain-language summary from the technical detail.
 *
 * Valthoris is used by elderly people and by users with low digital literacy,
 * for whom a wall of markdown, provider names and HTTP statuses is not an
 * answer. Every analysis therefore answers twice: a verdict line and one plain
 * sentence, which is all that is shown, and everything else after this marker,
 * which the interface keeps folded behind "Ver análise completa".
 */
export const DETAIL_MARKER = '[DETALHE]';

/** The shape every analysis answer must have: verdict first, detail folded. */
const ANSWER_LAYOUT = [
  `Lay the answer out in exactly two parts separated by a line containing only ${DETAIL_MARKER}.`,
  'First part (always visible, at most three short lines, no markdown, no asterisks, no',
  'headings): one verdict line chosen from "✅ Seguro", "⚠️ Suspeito", "❌ Perigoso",',
  '"❔ Não foi possível confirmar", "ℹ️ Conhecido/legítimo" (translated when the user writes in',
  'English), then a single sentence of plain explanation that a person with no technical',
  'knowledge understands.',
  `Then the line ${DETAIL_MARKER} on its own.`,
  'Second part: the complete technical detail — every field, the sources that answered, their',
  'timestamps, addresses, coordinates, and whatever could not be confirmed.',
].join(' ');

/**
 * Instructions for a turn that is conversation rather than a question about the
 * world.
 *
 * Nothing was looked up and nothing should be: a greeting, a complaint, a
 * question about the assistant itself or a plain "preciso de ajuda" is answered
 * the way a person answers, and citing web pages for it produces exactly the
 * irrelevant "sources" that made the assistant unreadable.
 */
const CASUAL_RESPONSE_FORMAT = [
  'This turn is conversation, not a factual question: no source was consulted and none was',
  'needed.',
  'Answer in one to three short sentences, warm and natural, in the user\'s language.',
  'Do not list sources, do not add sections, do not mention limitations, do not mention',
  'searches, and do not introduce yourself again.',
  'If the user seems to need something concrete, simply invite them, in one sentence, to say',
  'what they would like checked.',
].join(' ');

/**
 * Instructions for a turn grounded on a real web search.
 *
 * A search was performed for this turn, so the answer must be the answer — with
 * the pages it came from — and not a suggestion that the user searches for it.
 */
const WEB_RESPONSE_FORMAT = [
  'A real web search was performed for this turn and its results are in the evidence block.',
  'Answer the question directly and completely, in the user\'s language, using those results.',
  'Quote the concrete facts you found (names, addresses, phone numbers, dates, figures) and,',
  'for each one, name the page it came from.',
  'End with a "FONTES / SOURCES" list: the title and the full URL of every page you used,',
  'written out so it is clickable.',
  'If the results do not contain the answer, say exactly what is still missing instead of',
  'filling the gap from memory, and never claim a page said something it did not.',
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
  'Add "HORÁRIO / OPENING HOURS" whenever a source carries it.',
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
 * Instructions used for a request about current news, alerts or ongoing fraud
 * campaigns.
 *
 * The right source for "what are they inventing this week" is a news feed, and
 * an encyclopedia article is never an answer to it. When no news source
 * answered, saying so plainly *is* the answer — filling the gap with unrelated
 * pages is what produced Wikipedia articles about elections under a heading
 * about fraud alerts.
 */
const NEWS_RESPONSE_FORMAT = [
  'This turn asks for current news or alerts.',
  'Use only the sources in the evidence block that are genuinely news items, with their date.',
  'Never answer it from encyclopedia articles, and never present a general page as if it were',
  'a recent piece of news.',
  'If no news source returned anything, say plainly, in the user\'s language, that you have no',
  'access to current news at this moment and have no recent items to report — and stop there,',
  'instead of filling the answer with unrelated material.',
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

/**
 * Hard ceiling for a single model call.
 *
 * A provider that never answers is worse than one that fails: without a
 * deadline the turn hangs until the platform kills the whole invocation, so the
 * other provider is never tried and the user waits for an error. A grounded
 * (web-search) turn is the slowest case, hence the generous value.
 */
const MODEL_TIMEOUT_MS = 25_000;

/** `fetch` with a deadline; an expired one is a normal provider failure. */
async function fetchWithTimeout(url: string, init: RequestInit, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`${label} timed out after ${MODEL_TIMEOUT_MS} ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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
  const res = await fetchWithTimeout(
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
    'Gemini',
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
  const res = await fetchWithTimeout('https://api.deepseek.com/chat/completions', {
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
  }, 'DeepSeek');
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
      // The user keeps seeing one generic sentence, but the operator must be
      // able to tell an exhausted quota from a revoked key without reading raw
      // function logs, so every model failure lands in `governance.error_logs`
      // exactly like an intelligence-source failure does.
      void writeErrorLog({
        source: 'ai-chat/model',
        severity: next ? 'WARNING' : 'ERROR',
        message: `Model provider ${provider.name} failed`,
        detail,
        context: { provider: provider.name, webSearch, fallbackAvailable: Boolean(next) },
      });
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
  // The loop always spans the longer string so that a wrong length costs the
  // same time as a wrong character: returning early would leak the key length.
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
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

/**
 * Direct analysis of a single indicator — the sidebar tools' entry point.
 *
 * Scanner, Phone, Email, IBAN, Crypto Wallet, URL, QR Code, Domain and
 * Username used to reach the Internet Computer canisters and nothing else, so
 * the same number could be "no indicator matched" in the sidebar and a red
 * verdict in the assistant. This action runs *the same* provider lookups and
 * *the same* {@link computeVerdict} the assistant runs, and accepts the
 * canister findings (`local`) so both bodies of evidence produce one verdict.
 *
 * Nothing here needs a language model: the answer is the traffic light plus the
 * source reports the interface already knows how to render.
 */
async function handleAnalyse(payload: AnalyseRequest): Promise<Response> {
  const kind = typeof payload.kind === 'string' ? payload.kind as VerdictEntityKind : null;
  const value = typeof payload.value === 'string' ? payload.value.trim() : '';

  if (!kind || !ANALYSABLE_KINDS.includes(kind)) {
    return json({ error: 'Unsupported analysis kind' }, 400);
  }
  const valid = kind === 'username'
    ? USERNAME_RE.test(value)
    : isValidEntity(kind, value);
  if (value.length === 0 || value.length > 512 || !valid) {
    return json({ error: 'The value is not a valid ' + kind }, 400);
  }

  let sources: SourceReport[] = [];
  // No external provider covers a username: its verdict rests on the Valthoris
  // community evidence alone, and querying anything else would be pretending.
  if (kind !== 'username') {
    try {
      sources = await gatherAllIntelligence([{ kind, value }]);
    } catch (err) {
      // A provider fault must not deny the caller the canister evidence it
      // already has: the verdict is still computed, over less evidence.
      console.error('[ai-chat] analyse orchestration failed', err);
    }
  }

  const verdict = computeVerdict({
    kind,
    sources,
    entity: value,
    local: sanitizeLocalEvidence(payload.local),
    language: payload.language === 'en' ? 'en' : 'pt',
  });

  return json({ verdict, sources }, 200);
}

/** A username, as the Username tool submits it. */
const USERNAME_RE = /^@?[A-Za-z0-9._-]{2,64}$/;

/** The entity kinds the sidebar tools may ask for. */
const ANALYSABLE_KINDS: VerdictEntityKind[] = [
  'ip',
  'url',
  'domain',
  'email',
  'crypto_eth',
  'crypto_btc',
  'iban',
  'phone',
  'username',
];

/**
 * Keeps only the fields the verdict reads from the caller-supplied canister
 * evidence. The browser sends it, so nothing else is trusted, and no field is
 * ever used for authorization.
 */
function sanitizeLocalEvidence(local: unknown): LocalEvidence | undefined {
  if (!local || typeof local !== 'object') return undefined;
  const source = local as Record<string, any>;
  const numberOrUndefined = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

  const reputation = source.reputation && typeof source.reputation === 'object'
    ? {
      found: source.reputation.found === true,
      riskScore: numberOrUndefined(source.reputation.riskScore),
      trustScore: numberOrUndefined(source.reputation.trustScore),
      reportCount: numberOrUndefined(source.reputation.reportCount),
      isKnownScammer: source.reputation.isKnownScammer === true,
      isVerifiedBusiness: source.reputation.isVerifiedBusiness === true,
    }
    : undefined;

  const threat = source.threat && typeof source.threat === 'object'
    ? {
      isThreat: source.threat.isThreat === true,
      confidence: numberOrUndefined(source.threat.confidence),
      severity: typeof source.threat.severity === 'string'
        ? source.threat.severity.slice(0, 40)
        : null,
      matchedIndicators: numberOrUndefined(source.threat.matchedIndicators),
    }
    : undefined;

  const reports = Array.isArray(source.reports)
    ? source.reports.slice(0, 100).map((report: any) => ({
      status: typeof report?.status === 'string' ? report.status.slice(0, 40) : null,
      riskScore: numberOrUndefined(report?.riskScore),
    }))
    : undefined;

  if (!reputation && !threat && !reports) return undefined;
  return {
    ...(reputation ? { reputation } : {}),
    ...(threat ? { threat } : {}),
    ...(reports ? { reports } : {}),
  };
}

/** HTTP entry point. Exported so it can be exercised by the function tests. */export async function handleRequest(req: Request): Promise<Response> {
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

  if ((payload as any)?.action === 'analyse') {
    return await handleAnalyse(payload as AnalyseRequest);
  }

  const messages = sanitize(Array.isArray(payload.messages) ? payload.messages : []);
  if (messages.length === 0) {
    return json({ error: 'At least one message is required' }, 400);
  }

  // ─── Intelligence orchestration ───────────────────────────────────────────
  // Before the model answers, the intent of the last user turn is decided once,
  // the entity it refers to is resolved against the conversation, and — unless
  // the turn is plain conversation — the entity is enriched with the external
  // providers that cover it. The model then reasons over real data instead of
  // its own recollection, and never over a page that has nothing to do with the
  // question.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const artifact = lastUser ? detectArtifact(lastUser.content) : null;
  // What the user is referring to when they do not name it again ("a morada?").
  const subject = conversationSubject(messages);
  const intent: TurnIntent = lastUser
    ? classifyTurn(lastUser.content, Boolean(artifact), subject)
    : 'social';
  const intel = lastUser
    ? await collectIntelligence(lastUser.content, artifact, intent, subject)
    : null;

  // The resolved reference travels with the turn, so the model answers about
  // the place named earlier instead of asking for its name again.
  const lastContent = messages[messages.length - 1].content;
  const contextNote = subject && intent !== 'social'
    ? `\n\n---\nReferência resolvida na conversa / reference resolved from the conversation: "${subject}".`
    : '';
  const augmented = intel?.evidence
    ? `${lastContent}${contextNote}\n\n---\n${intel.evidence}`
    : contextNote
      ? `${lastContent}${contextNote}`
      : null;
  const modelMessages = augmented
    ? [...messages.slice(0, -1), { role: 'user' as const, content: augmented }]
    : messages;
  const grounded = Boolean(intel && intel.evidence);
  const systemPrompt = intent === 'social'
    ? `${SYSTEM_PROMPT} ${CASUAL_RESPONSE_FORMAT}`
    : intel && intel.evidence
      ? `${SYSTEM_PROMPT} ${responseFormatFor(intel.kind)}`
      : `${SYSTEM_PROMPT} ${UNGROUNDED_RESPONSE_FORMAT}`;

  // Google's own search tool is enabled on every turn that is a lookup rather
  // than conversation, unless a search engine already came back with pages in
  // this turn. That keeps a factual question from ever being answered from the
  // model's memory — if every engine was throttled, the model searches itself —
  // without spending the Gemini search quota twice on the same question.
  const webSearch = intent !== 'social' && !(intel?.searched ?? false);

  // ─── Deterministic verdict ────────────────────────────────────────────────
  // Computed from the provider payloads alone, before any answer is written:
  // the traffic light the user sees is a function of the evidence, never of
  // whichever model happened to answer (or of none answering at all).
  const language = lastUser ? verdictLanguage(lastUser.content) : 'pt';
  const verdict: Verdict | null = intel && isRiskKind(intel.kind)
    ? computeVerdict({
      kind: intel.kind,
      sources: intel.sources,
      entity: intel.entity,
      language,
    })
    : null;

  let completion: Completion;
  try {
    completion = await complete(modelMessages, systemPrompt, webSearch);
  } catch (err) {
    console.error('[ai-chat]', err);
    // The providers actually answered: their data is the answer, and losing it
    // because a language model is out of quota would be throwing away the very
    // lookup the user asked for. The evidence is reported as it stands.
    const fallback = intel ? answerFromEvidence(intel.kind, intel.sources, verdict) : null;
    if (fallback) {
      return json(
        {
          content: fallback,
          provider: 'valthoris/evidence',
          model: 'evidence-only',
          grounded: true,
          sources: intel!.sources,
          ...(verdict ? { verdict } : {}),
        },
        200,
      );
    }
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
      endpoint: 'web/grounding',
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
      // The verdict replaces whatever conclusion the model wrote: it is the
      // same one the evidence-only path would have produced.
      ...(verdict ? { content: applyVerdict(completion.content, verdict), verdict } : {}),
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
 * Puts the deterministic verdict at the very top of an answer.
 *
 * The model writes the explanation; the traffic light is not its decision. Any
 * verdict line the model produced on its own (a "✅ Seguro" that contradicts
 * four VirusTotal detections, for example) is removed from the visible part and
 * the computed headline takes its place, so the first thing the user reads is
 * always the conclusion the evidence supports.
 *
 * The technical detail after {@link DETAIL_MARKER} is left untouched: it stays
 * folded behind "Ver análise completa" in the interface.
 */
export function applyVerdict(content: string, verdict: Verdict): string {
  const markerIndex = content.indexOf(DETAIL_MARKER);
  const summary = markerIndex >= 0 ? content.slice(0, markerIndex) : content;
  const detail = markerIndex >= 0 ? content.slice(markerIndex) : '';

  const kept = summary
    .split('\n')
    .filter((line) => !MODEL_VERDICT_LINE_RE.test(line.trim()))
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const visible = [verdict.headline, ...kept].join('\n');
  return detail ? `${visible}\n${detail}` : visible;
}

/**
 * A verdict line written by the model, in either language.
 *
 * These are the openers the answer layout asks for; they are dropped once a
 * computed verdict exists, because two verdicts in the same answer — possibly
 * disagreeing — is worse than none.
 */
const MODEL_VERDICT_LINE_RE =
  /^(?:[*_\s]*)(?:✅|⚠️|⚠|❌|❔|❓|ℹ️|ℹ|🔴|🟠|🟡|🟢|⚪)/u;

/**
 * The answer built from the evidence alone, when no language model could write it.
 *
 * Asking for an address is a lookup, not a conversation: once Nominatim (or any
 * other provider) has answered, the information exists and the user is entitled
 * to it. Returning "de momento não consigo processar o seu pedido" because
 * Gemini and DeepSeek both refused the turn throws away a successful lookup and
 * makes a working data source look broken. This renders exactly what the
 * providers returned — nothing is inferred, nothing is completed from memory —
 * and says plainly that the model did not take part.
 *
 * Returns `null` when there is nothing real to show, in which case the caller
 * keeps the generic error.
 */
export function answerFromEvidence(
  kind: IntelEntityKind,
  sources: SourceReport[],
  verdict?: Verdict | null,
): string | null {
  const answered = sources.filter(
    (s) => s.status === 'success' && s.data && Object.keys(s.data).length > 0 && s.data.found !== false,
  );
  if (answered.length === 0) return null;

  const lines: string[] = [];

  const placeReports = answered.filter((s) => typeof s.data?.address === 'string' || s.data?.latitude);
  const webReports = answered.filter((s) => Array.isArray(s.data?.pages));

  // The plain-language part, which is all the user sees unless they open the
  // detail: what was found, in one line, with no provider names and no markup.
  const summaryName = firstEvidenceValue(placeReports, 'name');
  const summaryAddress = firstEvidenceValue(placeReports, 'address');
  if (verdict) {
    // The verdict does not depend on the language model, so it is exactly the
    // same here as it would have been in a model-written answer.
    lines.push(verdict.headline);
  } else if (kind === 'place' && (summaryName || summaryAddress)) {
    lines.push('ℹ️ Encontrámos este local nas fontes públicas de mapas.');
    const contact = firstEvidenceValue(placeReports, 'phone') ??
      firstEvidenceValue(webReports, 'phone');
    lines.push(
      `${summaryName ?? 'Local'} — ${summaryAddress ?? 'morada não confirmada'}${
        contact ? ` — ${contact}` : ''
      }.`,
    );
  } else {
    lines.push('❔ Não foi possível confirmar tudo.');
    lines.push('Reunimos abaixo apenas o que as fontes consultadas devolveram nesta pergunta.');
  }
  lines.push(DETAIL_MARKER);
  lines.push(
    'Resposta composta diretamente pelas fontes consultadas (o modelo de linguagem ' +
      'não está disponível neste momento). / Answer composed directly from the sources ' +
      'consulted (the language model is unavailable).',
  );
  lines.push('');

  if (kind === 'place' && placeReports.length > 0) {
    // Every provider contributes what it actually has: the gazetteer usually
    // gives the address and the coordinates, a web result the phone number.
    for (const [field, label] of PLACE_FIELD_LABELS) {
      const value = firstEvidenceValue(placeReports, field) ??
        firstEvidenceValue(webReports, field);
      lines.push(`${label}: ${value ?? 'não confirmado / not confirmed'}`);
    }
  } else {
    for (const report of answered) {
      if (Array.isArray(report.data?.pages)) continue;
      const details = Object.entries(report.data as Record<string, unknown>)
        .map(([key, value]) => {
          const rendered = evidenceValue(value);
          return rendered ? `${key}: ${rendered}` : null;
        })
        .filter((entry): entry is string => entry !== null);
      if (details.length > 0) {
        lines.push(`${report.provider} (${report.endpoint}) — ${details.join('; ')}`);
      }
    }
  }

  // The pages a search engine returned are the answer's substance when no model
  // could summarise them: title, link and the engine's own extract, verbatim.
  const pages = webPages(webReports);
  if (pages.length > 0) {
    lines.push('');
    lines.push('RESULTADOS DA PESQUISA / SEARCH RESULTS:');
    for (const page of pages) {
      lines.push(`- ${page.title}`);
      if (page.snippet) lines.push(`  ${page.snippet}`);
      lines.push(`  ${page.url}`);
    }
  }

  const answers = webReports
    .map((report) => evidenceValue((report.data as Record<string, unknown>).answer))
    .filter((value): value is string => value !== null);
  if (answers.length > 0) {
    // Right after the header of the technical part, never before the marker:
    // the visible summary stays short.
    lines.splice(lines.indexOf(DETAIL_MARKER) + 2, 0, answers[0], '');
  }

  lines.push('');
  lines.push('FONTES / SOURCES:');
  for (const report of answered) {
    lines.push(`- ${report.provider} (${report.endpoint}) — ${report.timestamp}`);
  }

  const unavailable = sources.filter((s) => s.status === 'failed');
  if (unavailable.length > 0) {
    lines.push('');
    lines.push('LIMITAÇÕES / LIMITATIONS:');
    for (const report of unavailable) {
      // The provider is named so the user knows what could not be checked; the
      // upstream diagnostic stays in `sources` for the operator, because an
      // HTTP status in the middle of an answer only reads like a broken app.
      lines.push(`- ${report.provider}: não respondeu / did not answer`);
    }
  }

  return lines.join('\n');
}

/** The first non-empty value of `field` across a set of source reports. */
function firstEvidenceValue(reports: SourceReport[], field: string): string | null {
  for (const report of reports) {
    const value = evidenceValue((report.data as Record<string, unknown> | undefined)?.[field]);
    if (value) return value;
  }
  return null;
}

/** The pages the search engines returned, deduplicated across engines. */
function webPages(reports: SourceReport[]): WebResult[] {
  const seen = new Set<string>();
  const pages: WebResult[] = [];
  for (const report of reports) {
    const list = (report.data as Record<string, unknown>).pages;
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const page = entry as Partial<WebResult>;
      if (typeof page?.url !== 'string' || typeof page?.title !== 'string') continue;
      if (seen.has(page.url)) continue;
      seen.add(page.url);
      pages.push({
        title: page.title,
        url: page.url,
        ...(typeof page.snippet === 'string' ? { snippet: page.snippet } : {}),
      });
      if (pages.length >= 8) return pages;
    }
  }
  return pages;
}

/** The place fields rendered, in order, by the evidence-only answer. */
const PLACE_FIELD_LABELS: [string, string][] = [
  ['name', 'NOME / NAME'],
  ['address', 'MORADA / ADDRESS'],
  ['phone', 'CONTACTO / CONTACT'],
  ['website', 'SITE / WEBSITE'],
  ['openingHours', 'HORÁRIO / OPENING HOURS'],
  ['link', 'MAPA / MAP'],
];

/** Renders one evidence value, or nothing at all when it carries no information. */
function evidenceValue(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts = value.map((item) => evidenceValue(item)).filter((item) => item !== null);
    return parts.length > 0 ? parts.join(', ') : null;
  }
  return null;
}

/**
 * Public-place lookup: the entity being asked about.
 *
 * Either an explicit kind of establishment, or the "X em/no/na/de Y" shape that
 * names a place ("hospital de Évora", "clínica no Porto").
 */
const PLACE_ENTITY_WORDS =
  "restaurante|loja|[óo]ptica|[óo]tica|hospital|centro de sa[úu]de|centro comercial|escola|universidade|hotel|hostel|pens[ãa]o|empresa|cl[íi]nica|banco|multibanco|farm[áa]cia|caf[ée]|padaria|pastelaria|pizzaria|churrasqueira|talho|peixaria|mercado|supermercado|hipermercado|minimercado|bomba de gasolina|gasolineira|posto de (?:combust[íi]vel|abastecimento)|gin[áa]sio|oficina|est[úa]dio|museu|biblioteca|correios|esquadra|posto da (?:gnr|psp)|junta de freguesia|c[âa]mara municipal|tribunal|dentista|veterin[áa]ri[oa]|cabeleireiro|parque de estacionamento|esta[çc][ãa]o|terminal rodovi[áa]rio|aeroporto|igreja|restaurant|shop|store|supermarket|clinic|pharmacy|bakery|gas station|petrol station|school|company|hotel|library|museum";

const PLACE_ENTITY_RE = new RegExp(`\\b(${PLACE_ENTITY_WORDS})\\b`, 'i');

const PLACE_PATTERN_RE =
  /\b\p{L}[\p{L}.'-]{2,}\s+(?:em|no|na|nos|nas|d[oa]s?|de|in|at)\s+\p{Lu}[\p{L}.'-]{2,}/u;

/**
 * Public-place lookup: the factual request being made about it.
 *
 * A place lookup only runs when a factual detail is actually asked for, so a
 * greeting or generic chat never triggers an external search.
 */
const PLACE_REQUEST_RE =
  /\b(contact[oa]s?|telefone|telem[óo]vel|n[úu]mero|morada|endere[çc]o|onde\s+(?:fica|ficam|é|e|s[ãa]o|est[áa]|esta|est[ãa]o)|hor[áa]rio|hor[áa]rios|localiza[çc][ãa]o|site|website|p[áa]gina|quem\s+é\s+(?:esta|essa|a)\s+empresa|phone|address|opening hours|where is|contact)\b/i;

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
 * Public-place lookup: a street address written out in full.
 *
 * A postal address ("Rua da Liberdade 5, 2900-123 Setúbal") names a location
 * just as clearly as an establishment does, so it must reach the map too.
 */
const PLACE_ADDRESS_RE =
  /\b(rua|avenida|av\.|travessa|largo|pra[çc]a|estrada|rotunda|beco|alameda|azinhaga|calçada|cal[çc]ada|urbaniza[çc][ãa]o|bairro|zona\s+industrial|parque\s+industrial|street|avenue|road|boulevard|square)\b/i;

/** Portuguese postal code — on its own it already identifies a location. */
const PLACE_POSTCODE_RE = /\b\d{4}-\d{3}\b/;

/**
 * A place named the way people actually name one, without any question.
 *
 * Either the capitalised "X em/de Y" shape, or an establishment word followed
 * by its name ("hospital de Setúbal", "farmácia Central", "Restaurante Á do
 * Fernando"), which also holds when the user types everything in lower case and
 * when the name itself is a single letter or a very short word.
 */
const NAMED_PLACE_RE = new RegExp(
  `\\b(?:${PLACE_ENTITY_WORDS})\\s+(?:(?:d[oa]s?|de|em|no|na|of|in|at)\\s+)?\\p{L}[\\p{L}.'-]*`,
  'iu',
);

/**
 * Turns that use a place word without pointing at any real place: opinions,
 * small talk and questions about what something *is* rather than where it is.
 */
const PLACE_NON_LOOKUP_RE =
  /\b(gosto|adoro|odeio|detesto|acho|penso|fui|estive|trabalho|trabalhei|conhe[çc]o|recomendo|obrigad[oa]|ol[áa]|bom\s+dia|boa\s+tarde|boa\s+noite|o\s+que\s+[ée]|que\s+[ée]|significa|significado|defini[çc][ãa]o|define|explica(?:r)?|como\s+funciona|what\s+is|what\s+are|how\s+does|thanks|thank\s+you|hello|hi\s+there)\b/i;

/** A bare place mention is a name, not a paragraph. */
const BARE_PLACE_MAX_WORDS = 12;

/**
 * True when the whole turn is simply the name of a place or an address.
 *
 * Typing "Hospital de Setúbal" — with no "morada", "contacto" or "onde fica" —
 * is how people search for a place, and it used to be answered from the
 * model's memory alone because no question word was present. A short turn that
 * names a place and asks nothing else is a location search and must be looked
 * up, while opinions ("gosto muito deste restaurante"), greetings and "o que é
 * um hospital" stay out of every external provider.
 */
export function isBarePlaceMention(text: string): boolean {
  const cleaned = text.replace(/[?¿!¡.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 3) return false;
  if (cleaned.split(' ').length > BARE_PLACE_MAX_WORDS) return false;
  if (PLACE_NON_LOOKUP_RE.test(cleaned)) return false;
  return (
    PLACE_PATTERN_RE.test(cleaned) ||
    NAMED_PLACE_RE.test(cleaned) ||
    PLACE_ADDRESS_RE.test(cleaned) ||
    PLACE_POSTCODE_RE.test(cleaned)
  );
}

/**
 * True when the turn is genuinely about a real public place or business.
 *
 * A place must be named — an establishment type ("restaurante", "farmácia"),
 * the "X em Y" shape or a street address — and the turn must then either ask a
 * factual question about it, express a practical need that only a location can
 * satisfy, or simply *be* that name. "Olá", "bom dia" or "obrigado" satisfy
 * none of those, so they still never reach an external provider.
 */
export function isPlaceLookup(text: string): boolean {
  const hasEntity =
    PLACE_ENTITY_RE.test(text) ||
    PLACE_PATTERN_RE.test(text) ||
    PLACE_ADDRESS_RE.test(text) ||
    PLACE_POSTCODE_RE.test(text);
  if (!hasEntity) return false;
  if (PLACE_REQUEST_RE.test(text) || PLACE_NEED_RE.test(text)) return true;
  return isBarePlaceMention(text);
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
  /\b(qual\s+é|qual|quero|queria|gostava|preciso|sabes|podes|dizer|diz-me|d[áa]-me|indica(?:-me)?|leva-me|por favor|o\s+contact[oa]s?|contact[oa]s?|n[úu]mero de telefone|n[úu]mero|telefone|telem[óo]vel|morada|endere[çc]o|hor[áa]rio(?:s)?|localiza[çc][ãa]o|onde\s+(?:fica|ficam|é|e|s[ãa]o|est[áa]|esta|est[ãa]o)|estou\s+com\s+fome|com\s+fome|fome|comer|almo[çc]ar|jantar|lanchar|beber|dormir|abastecer|perto\s+de\s+mim|mais\s+pr[óo]xim[oa]|aqui\s+perto|nas?\s+redondezas|como\s+(?:chego|chegar|ir)|ir\s+(?:at[ée]\s+)?(?:a[oo]s?|[àá]s?)|dire[çc][õo]es|rota|caminho|mapa|what\s+is|i\s+am\s+hungry|hungry|near\s+me|nearest|nearby|take\s+me|directions|route|map|the\s+)\b/gi;

/**
 * Debris left behind once the need words are removed from the turn.
 *
 * "McDonald's em Évora, estou com fome, preciso de comer" collapses to
 * "McDonald's em Évora , , de": the commas of the removed clauses and the
 * preposition that introduced them survive, and a gazetteer takes them
 * literally. Empty separators are collapsed and a preposition or article left
 * hanging at either end of the query is dropped, so only the place is searched.
 */
const PLACE_QUERY_DANGLING_WORDS =
  "d[oa]s?|de|em|n[oa]s?|a[oo]s?|[àá]s?|um|uma|uns|umas|para|com|e|of|in|at|to|[oa]s?";

const PLACE_QUERY_DANGLING_HEAD_RE = new RegExp(`^(?:${PLACE_QUERY_DANGLING_WORDS})\\b`, 'i');
const PLACE_QUERY_DANGLING_TAIL_RE = new RegExp(`\\b(?:${PLACE_QUERY_DANGLING_WORDS})$`, 'i');

/** Collapses the separators and connectives left over by the noise removal. */
function tidyPlaceQuery(text: string): string {
  let cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;])\s*/g, '$1 ')
    .replace(/([,;])(?:\s*[,;])+/g, '$1')
    .trim();
  for (let pass = 0; pass < 4; pass += 1) {
    const trimmed = cleaned
      .replace(/^[\s,;:.\-–]+/, '')
      .replace(/[\s,;:.\-–]+$/, '')
      .replace(PLACE_QUERY_DANGLING_HEAD_RE, '')
      .replace(PLACE_QUERY_DANGLING_TAIL_RE, '')
      .trim();
    if (trimmed === cleaned) break;
    cleaned = trimmed;
  }
  return cleaned;
}

/** Builds the Nominatim query from the turn: the place, without the question. */
export function placeQuery(text: string): string {
  const cleaned = tidyPlaceQuery(text.replace(/[?¿!¡]/g, ' ').replace(PLACE_QUERY_NOISE_RE, ' '));
  return (cleaned.length >= 3 ? cleaned : text.trim()).slice(0, 200);
}

/** Chat turns that justify a live current-threat news lookup. */
const NEWS_INTENT_RE =
  /\b(latest|recent|current|news|trend|campaign|outbreak|zero[- ]day|alerts?|this\s+week|ultim[oa]s?|recentes?|not[ií]cias?|atual(?:idade)?|amea[çc]as?|tend[êe]ncias?|alertas?|esta\s+semana|este\s+m[êe]s|[úu]ltimos\s+dias)\b/i;

/**
 * Turns that are conversation, not a question about the world.
 *
 * These are the only turns that must *not* reach a search engine: a greeting, a
 * thank-you, an acknowledgement or a remark addressed to the assistant itself.
 * Everything else — any subject at all — is looked up, because answering a real
 * question from the model's memory is precisely the behaviour being removed.
 */
const SMALL_TALK_RE =
  /^(?:[\s!?.…,]*(?:ol[áa]|oi|hey|hi|hello|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|como\s+est[áa]s?|obrigad[oa]|agradecido|thanks|thank\s+you|ok|okay|certo|perfeito|fixe|adeus|at[ée]\s+j[áa]|bye|good\s*bye|sim|n[ãa]o|yes|no|test(?:e)?)(?![\p{L}\p{N}]))+[\s!?.…,]*$/iu;

/** Turns addressed to the assistant itself, which no external page can answer. */
const SELF_REFERENTIAL_RE =
  /^\s*(?:quem\s+[ée]s\s+tu|quem\s+es\s+tu|o\s+que\s+[ée]s\s+tu|what\s+are\s+you|who\s+are\s+you|como\s+te\s+chamas|what\s+is\s+your\s+name)\b/i;

/** A turn too short to search with, once punctuation is removed. */
const MIN_SEARCHABLE_CHARS = 3;

/**
 * True when the turn should be searched on the open web.
 *
 * The rule is deliberately inverted compared with the previous behaviour: the
 * assistant searches by default and only skips the search for small talk. A
 * question about a restaurant, a law, a medicine, a football result or a
 * company is a question about the world, and the world is not inside the model.
 */
export function isSearchableTurn(text: string): boolean {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.replace(/[^\p{L}\p{N}]/gu, '').length < MIN_SEARCHABLE_CHARS) return false;
  if (SMALL_TALK_RE.test(cleaned)) return false;
  if (SELF_REFERENTIAL_RE.test(cleaned)) return false;
  return true;
}

/** The query handed to the search engines: the turn itself, trimmed. */
export function webQuery(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

// ─── Intent detection ───────────────────────────────────────────────────────
//
// One engine, used by the whole function, decides what a turn *is* before
// anything is looked up. It is the piece that both stops a search that makes no
// sense ("preciso de ajuda" answered with an album on Wikipedia) and starts the
// one that does, and it is deliberately the only place where that decision is
// taken.

/**
 * What a turn is asking for.
 *
 *   social       — conversation: a greeting, a complaint, a remark about the
 *                  assistant itself, a vague sentence with nothing to verify.
 *                  Nothing at all is looked up.
 *   artifact     — a number, email, URL, IBAN, IP or wallet to analyse.
 *   news         — current news, alerts or campaigns: news feeds, never an
 *                  encyclopedia.
 *   place        — a real public place or business.
 *   encyclopedic — a question about a concept, a definition or history: the
 *                  only intent for which Wikipedia is a legitimate source.
 *   factual      — any other question about the world: open web search.
 */
export type TurnIntent = 'social' | 'artifact' | 'news' | 'place' | 'encyclopedic' | 'factual';

/** Questions an encyclopedia genuinely answers. */
const ENCYCLOPEDIC_RE =
  /(?<![\p{L}\p{N}])(o\s+que\s+(?:é|e|s[ãa]o|significa)|que\s+(?:é|e)\s+(?:o|a|um|uma)|quem\s+(?:é|e|foi|era|s[ãa]o)|hist[óo]ria\s+d[aeo]s?|origem\s+d[aeo]s?|significado|defini[çc][ãa]o|define|como\s+funciona|what\s+is|what\s+are|who\s+(?:is|was|were)|history\s+of|meaning\s+of|definition\s+of|how\s+does)(?![\p{L}\p{N}])/iu;

/**
 * Turns addressed to the assistant, or to the situation, rather than to the
 * world.
 *
 * "Preciso de ajuda", "não falas comigo?", "pensava que eras uma inteligência
 * artificial", "posso ser teu amigo" were each searched literally on Wikipedia
 * and DuckDuckGo, and answered with the album, the film or the serial killer
 * whose name happened to match. None of them is a question about the world.
 */
const SOCIAL_MARKERS_RE =
  /(?<![\p{L}\p{N}])(preciso\s+de\s+ajuda|pode(?:s|m)?\s+ajudar|ajuda(?:-me)?|n[ãa]o\s+sabes|n[ãa]o\s+percebes|n[ãa]o\s+falas|falas\s+comigo|conversar|conversa(?:r|mos)?|inteligência\s+artificial|intelig[êe]ncia\s+artificial|rob[oô]t?|chatbot|amigo|amiga|amizade|desabafar|est[áa]s?\s+a[ií]|porcaria|est[úu]pid[oa]|idiota|in[úu]til|burro|desculpa|pe[çc]o\s+desculpa|bom\s+trabalho|gosto\s+de\s+ti|sinto-me|estou\s+triste|estou\s+farto|help\s+me|i\s+need\s+help|can\s+you\s+help|are\s+you\s+(?:there|real|human|an?\s+ai)|be\s+my\s+friend|you\s+are\s+useless)(?![\p{L}\p{N}])/iu;

/** A turn whose subject is named in it, rather than left to the context. */
const OWN_SUBJECT_PROPER_NOUN_RE = /\S+\s+["'“«]?\p{Lu}[\p{L}'’-]{2,}/u;
const OWN_SUBJECT_NUMBER_RE = /\d{3,}/;
const OWN_SUBJECT_HANDLE_RE = /(?:@|https?:\/\/|\b[\w-]+\.(?:com|pt|net|org|io|eu)\b)/i;

/** True when the turn names the thing it is about, instead of pointing at it. */
export function namesOwnSubject(text: string): boolean {
  return (
    OWN_SUBJECT_PROPER_NOUN_RE.test(text) ||
    OWN_SUBJECT_NUMBER_RE.test(text) ||
    OWN_SUBJECT_HANDLE_RE.test(text) ||
    PLACE_ADDRESS_RE.test(text) ||
    PLACE_POSTCODE_RE.test(text)
  );
}

/** A short turn with nothing in it to look up is conversation, not a question. */
const CASUAL_MAX_WORDS = 6;
const SOCIAL_MAX_WORDS = 24;

/**
 * True when the turn is conversation and must not reach any external source.
 *
 * The test is not a keyword list of greetings: a turn is conversation when it
 * neither names a subject (a proper noun, a number, an address, a handle) nor
 * asks something an encyclopedia or a search engine could answer. That is what
 * separates "posso ser teu amigo" from "Hospital de Évora".
 */
export function isSocialTurn(text: string): boolean {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.replace(/[^\p{L}\p{N}]/gu, '').length < MIN_SEARCHABLE_CHARS) return true;
  if (SMALL_TALK_RE.test(cleaned) || SELF_REFERENTIAL_RE.test(cleaned)) return true;
  const words = cleaned.split(' ').filter((w) => w.length > 0);
  if (words.length > SOCIAL_MAX_WORDS) return false;
  if (namesOwnSubject(cleaned)) return false;
  if (ENCYCLOPEDIC_RE.test(cleaned)) return false;
  if (isPlaceLookup(cleaned)) return false;
  if (SOCIAL_MARKERS_RE.test(cleaned)) return true;
  return words.length <= CASUAL_MAX_WORDS;
}

/**
 * Things a follow-up says instead of repeating the name of the subject.
 *
 * "Morada do hospital", "e o contacto?", "onde fica isso", "localização do que
 * te pedi" all refer to something already on the table, and used to be treated
 * as brand-new turns with no subject at all.
 */
const REFERENCE_RE =
  /(?<![\p{L}\p{N}])(isso|isto|aquilo|dele|dela|deles|delas|desse|dessa|deste|desta|daquele|daquela|a[ií]|l[áa]|o\s+mesmo|a\s+mesma|que\s+te\s+pedi|que\s+pedi|que\s+disse|que\s+falei|anterior|acima|mencionad[oa]|it|that|there|the\s+same)(?![\p{L}\p{N}])/iu;

/** Maximum number of earlier turns scanned for the subject of a follow-up. */
const CONTEXT_WINDOW = 20;

/**
 * True when the turn only makes sense against what was said before.
 *
 * It asks for a detail (an address, a contact, an opening time, a location) or
 * points at something with a pronoun, and names no subject of its own.
 */
export function isFollowUpReference(text: string): boolean {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length === 0) return false;
  if (namesOwnSubject(cleaned)) return false;
  if (cleaned.split(' ').length > BARE_PLACE_MAX_WORDS) return false;
  return (
    PLACE_REQUEST_RE.test(cleaned) ||
    PLACE_NEED_RE.test(cleaned) ||
    REFERENCE_RE.test(cleaned) ||
    /^e\s+/i.test(cleaned)
  );
}

/**
 * The subject a follow-up refers to, taken from the conversation itself.
 *
 * The most recent earlier user turn that actually names something is the
 * subject: asking "Hospital Distrital de Évora" and then "morada do hospital"
 * is one question in two messages, and the second one must be looked up against
 * the first. Returns `null` when the turn stands on its own or when nothing
 * earlier named a subject — the assistant then asks, rather than guessing.
 */
export function conversationSubject(messages: ChatMessage[]): string | null {
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
  if (lastUserIndex < 0) return null;
  if (!isFollowUpReference(messages[lastUserIndex].content)) return null;

  const start = Math.max(0, lastUserIndex - CONTEXT_WINDOW);
  for (let i = lastUserIndex - 1; i >= start; i -= 1) {
    const message = messages[i];
    if (message.role !== 'user') continue;
    const text = message.content.replace(/\s+/g, ' ').trim();
    if (text.length === 0 || !namesOwnSubject(text) || isSocialTurn(text)) continue;
    const subject = placeQuery(text);
    if (subject.length >= 3) return subject.slice(0, 160);
  }
  return null;
}

/**
 * What this turn is, decided once and used everywhere.
 *
 * `subject` is the entity carried over from the conversation when the turn is a
 * follow-up: it is what makes "e o contacto?" a place lookup rather than a
 * sentence with nothing in it.
 */
export function classifyTurn(
  text: string,
  hasArtifact: boolean,
  subject: string | null = null,
): TurnIntent {
  if (hasArtifact) return 'artifact';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.replace(/[^\p{L}\p{N}]/gu, '').length < MIN_SEARCHABLE_CHARS) return 'social';
  if (SMALL_TALK_RE.test(cleaned) || SELF_REFERENTIAL_RE.test(cleaned)) return 'social';
  if (NEWS_INTENT_RE.test(cleaned)) return 'news';
  const withContext = subject ? `${subject} ${cleaned}` : cleaned;
  if (isPlaceLookup(withContext)) return 'place';
  if (ENCYCLOPEDIC_RE.test(cleaned)) return 'encyclopedic';
  if (subject) return 'factual';
  if (isSocialTurn(cleaned)) return 'social';
  return 'factual';
}

/**
 * The sources that must stay out of a turn of this kind.
 *
 * Wikipedia is an encyclopedia, not a fallback: consulted for a phone number,
 * for a fraud alert or for "posso ser teu amigo" it can only return something
 * unrelated, which then appears in the answer as a cited source.
 */
export function excludedProvidersFor(intent: TurnIntent): string[] {
  return intent === 'encyclopedic' ? [] : ['Wikipedia'];
}

/** The answer format that matches what was actually looked up for the turn. */
function responseFormatFor(kind: IntelEntityKind): string {
  if (kind === 'place') return `${PLACE_RESPONSE_FORMAT} ${ANSWER_LAYOUT}`;
  if (kind === 'topic') return `${NEWS_RESPONSE_FORMAT} ${WEB_RESPONSE_FORMAT} ${ANSWER_LAYOUT}`;
  if (kind === 'web') return `${WEB_RESPONSE_FORMAT} ${ANSWER_LAYOUT}`;
  return `${INTEL_RESPONSE_FORMAT} ${ANSWER_LAYOUT}`;
}

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
 * Two things happen here, and both are lookups against real services: the
 * entity in the turn (an artefact, a place, a current-threat topic) is enriched
 * with the providers that cover it, and — for anything that is a question
 * rather than small talk — the open web is searched as well. The model is then
 * reasoning over pages that exist, whatever the subject is.
 *
 * A turn with no entity and no searchable question produces no lookup at all.
 */
async function collectIntelligence(
  userText: string,
  artifact: DetectedArtifact | null,
  intent: TurnIntent,
  subject: string | null,
): Promise<
  {
    kind: IntelEntityKind;
    entity: string;
    sources: SourceReport[];
    evidence: string | null;
    searched: boolean;
  } | null
> {
  // Conversation is answered as conversation: no provider is contacted at all,
  // so no irrelevant page can end up cited as a source.
  if (intent === 'social') return null;

  const entities: IntelEntity[] = [];
  const artifactEntity = artifact ? intelEntityFor(artifact) : null;
  if (artifactEntity) entities.push(artifactEntity);

  // The subject carried over from the conversation is what is searched for,
  // with the detail the user is now asking about appended to it.
  const searchText = subject ? `${subject} ${userText}` : userText;

  if (!artifactEntity && intent === 'place') {
    entities.push({ kind: 'place', value: placeQuery(subject ?? userText) });
  }
  if (intent === 'news') entities.push({ kind: 'topic', value: searchText.slice(0, 200) });
  entities.push({ kind: 'web', value: webQuery(searchText) });

  if (entities.length === 0) return null;
  const primary = entities[0];

  let sources: SourceReport[];
  try {
    sources = await gatherAllIntelligence(entities, {
      excludeProviders: excludedProvidersFor(intent),
    });
  } catch (err) {
    // The orchestrator itself must never break the conversation.
    console.error('[ai-chat] intelligence orchestration failed', err);
    return null;
  }
  if (sources.length === 0) return null;

  const usable = sources.some((s) => s.status !== 'not_configured');
  return {
    kind: primary.kind,
    entity: primary.value,
    sources,
    evidence: usable ? formatEvidence(primary, sources) : null,
    // Whether a search engine really came back with pages in this turn. It
    // decides whether the answer call still needs to spend a second search.
    searched: sources.some(
      (s) => s.status === 'success' && Array.isArray((s.data as any)?.pages) &&
        ((s.data as any).pages as unknown[]).length > 0,
    ),
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
