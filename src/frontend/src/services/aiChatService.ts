/**
 * AI Assistant service.
 *
 * The assistant talks to the `ai-chat` Supabase Edge Function
 * (supabase/functions/ai-chat), which holds the LLM credentials. The browser
 * never sees an API key, and the function is the single place where Google
 * Gemini — the only provider — is called.
 *
 * Required browser configuration:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * Required Edge Function secrets:
 *   GEMINI_API_KEY (optionally GEMINI_MODEL)
 *
 * Every failure is thrown as a real Error — the UI must show it instead of a
 * fabricated answer.
 */

import {
  functionAuthHeaders,
  getSupabase,
  isSupabaseConfigured,
  SUPABASE_CONFIG_ERROR,
} from './supabaseClient';

export const AI_FUNCTION_NAME = 'ai-chat';

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Result of the structured security analysis recorded in the fraud pipeline.
 * Present only when the turn actually contained an analysable artefact.
 */
export interface AiChatAnalysis {
  /** True when a decision was genuinely produced and persisted. */
  recorded: boolean;
  eventId?: string;
  decisionId?: string;
  verdict?: 'fraud' | 'suspicious' | 'legitimate' | 'unknown';
  confidenceScore?: number;
  /** Real error when the analysis or its persistence failed. */
  error?: string;
}

/**
 * One external intelligence lookup performed by the backend for this turn.
 *
 * Reports are rendered exactly as received: the UI never adds a provider to
 * the list and never turns a failed lookup into a result. API keys stay in the
 * Edge Function — a source report only carries the provider name, the lookup
 * that was performed and what it returned.
 */
export interface AiChatSource {
  provider: string;
  endpoint: string;
  entity: string;
  timestamp: string;
  /** `disabled` marks a source deliberately switched off (retired upstream). */
  status: 'success' | 'failed' | 'not_configured' | 'disabled';
  error?: string;
  data?: Record<string, unknown>;
}

export interface AiChatReply {
  content: string;
  provider: string;
  model: string;
  analysis?: AiChatAnalysis;
  /**
   * True when the answer stands on evidence collected in this very turn.
   * False means the model answered from its own knowledge — which the UI says
   * out loud, so a lucky-but-unverified answer is never mistaken for a
   * verified one.
   */
  grounded?: boolean;
  /** External sources consulted for this turn, when the turn required them. */
  sources?: AiChatSource[];
  /**
   * The deterministic traffic-light verdict, when the turn analysed an
   * indicator. It is already the first thing inside `content`; it is repeated
   * here in structured form so the interface can colour the answer.
   */
  verdict?: AiVerdict;
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
    if (context.status === 404) {
      return (
        `AI backend not found (HTTP 404): the Supabase project this browser is ` +
        `configured with (VITE_SUPABASE_URL) has no "${AI_FUNCTION_NAME}" ` +
        'Edge Function deployed. Deploy it with the "Deploy Supabase Edge ' +
        'Functions" workflow and make sure SUPABASE_PROJECT_REF is the same ' +
        'project as VITE_SUPABASE_URL.'
      );
    }
    if (context.status === 401) {
      return (
        'AI backend rejected the request (HTTP 401). Check that ' +
        'VITE_SUPABASE_ANON_KEY matches the project and that the ' +
        `"${AI_FUNCTION_NAME}" function is deployed with JWT verification ` +
        'disabled (supabase/config.toml).'
      );
    }
    return `AI backend returned HTTP ${context.status}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * The deterministic verdict computed by the backend for one indicator.
 *
 * It never comes from a language model: the Edge Function scores the raw
 * provider payloads (and the canister evidence the browser passes in) against
 * documented thresholds, so the assistant and the sidebar tools always show the
 * same traffic light for the same target.
 */
export type VerdictLevel = 'danger' | 'caution' | 'safe' | 'insufficient';

export interface AiVerdictSignal {
  provider: string;
  endpoint: string;
  severity: 'strong' | 'moderate' | 'weak';
  weight: number;
  reason: string;
  reasonEn: string;
}

export interface AiVerdict {
  level: VerdictLevel;
  score: number;
  signals: AiVerdictSignal[];
  coverage: { answered: number; failed: number; notConfigured: number };
  headline: string;
}

/** The indicator kinds the shared analysis pipeline accepts. */
export type AnalysableKind =
  | 'ip'
  | 'url'
  | 'domain'
  | 'email'
  | 'crypto_eth'
  | 'crypto_btc'
  | 'iban'
  | 'phone'
  /** Scored over the Valthoris community evidence alone. */
  | 'username';

/** What the Internet Computer canisters already answered, in the browser. */
export interface LocalEvidence {
  reputation?: {
    found: boolean;
    riskScore?: number;
    trustScore?: number;
    reportCount?: number;
    isKnownScammer?: boolean;
    isVerifiedBusiness?: boolean;
  };
  threat?: {
    isThreat: boolean;
    confidence?: number;
    severity?: string | null;
    matchedIndicators?: number;
  };
  reports?: Array<{ status?: string | null; riskScore?: number }>;
}

export interface AnalyseReply {
  verdict: AiVerdict;
  sources: AiChatSource[];
}

/**
 * Runs the shared analysis pipeline on a single indicator.
 *
 * This is the same code path the AI Assistant takes for the same value: the
 * external sources are queried by the Edge Function and the verdict is computed
 * there. `local` carries the canister findings so both bodies of evidence are
 * weighed together instead of producing two disagreeing answers.
 */
export async function analyseIndicator(
  kind: AnalysableKind,
  value: string,
  local?: LocalEvidence,
  language: 'pt' | 'en' = 'pt',
): Promise<AnalyseReply> {
  if (!isAiBackendConfigured) {
    throw new Error(AI_BACKEND_CONFIG_ERROR);
  }

  const { data, error } = await getSupabase().functions.invoke<AnalyseReply | { error: string }>(
    AI_FUNCTION_NAME,
    {
      body: { action: 'analyse', kind, value, language, ...(local ? { local } : {}) },
      headers: functionAuthHeaders(),
    },
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
  const reply = data as AnalyseReply;
  if (!reply.verdict || typeof reply.verdict.level !== 'string') {
    throw new Error('AI backend returned no verdict');
  }
  return reply;
}

/**
 * Sends the conversation to the AI backend and returns the assistant reply.
 *
 * Throws when the backend is unreachable, unconfigured or returns an error.
 *
 * `principal` is forwarded as attribution metadata for the fraud pipeline; it
 * is not an authorization input and the backend never treats it as one.
 */
export async function sendChat(
  messages: AiChatMessage[],
  principal?: string | null,
): Promise<AiChatReply> {
  if (!isAiBackendConfigured) {
    throw new Error(AI_BACKEND_CONFIG_ERROR);
  }

  const { data, error } = await getSupabase().functions.invoke<AiChatReply | { error: string }>(
    AI_FUNCTION_NAME,
    {
      body: { messages, ...(principal ? { principal } : {}) },
      headers: functionAuthHeaders(),
    },
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
