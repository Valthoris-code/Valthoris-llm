/**
 * Fraud-pipeline persistence for the `ai-chat` Edge Function.
 *
 * When a user genuinely asks the assistant to analyse an artefact (a URL, an
 * e-mail address, a wallet, an IBAN or a phone number), the analysis that is
 * really performed is recorded in the existing fraud pipeline tables:
 *
 *   fraud_events                   — the submitted artefact (idempotent id)
 *   fraud_workflow_runs            — running → completed | failed
 *   fraud_decisions                — only when the model returned a valid,
 *                                    structured verdict
 *   fraud_decision_justifications  — only when a decision was produced
 *
 * Nothing is written unless it actually happened: a failed or unparsable
 * analysis records a `failed` workflow run carrying the real error message and
 * no decision at all. Verdicts, confidence scores, risk signals and
 * justifications always come from the provider response — they are never
 * synthesised here.
 *
 * Writes use the service-role key, which is injected into every Supabase Edge
 * Function (SUPABASE_SERVICE_ROLE_KEY) and never leaves the server. Row Level
 * Security stays enabled and untouched: the service role has explicit policies
 * on all four tables.
 */

// deno-lint-ignore-file no-explicit-any

import { deterministicUuid } from './ids.ts';
import type { DetectedArtifact } from './artifacts.ts';

/** Pipeline registered by migration 20260801000000. */
const PIPELINE_NAME = 'default-pipeline-v1';
const MODE = 'auto';

export type FraudVerdict = 'fraud' | 'suspicious' | 'legitimate' | 'unknown';

export interface StructuredAnalysis {
  verdict: FraudVerdict;
  confidenceScore: number;
  justification: string;
  riskSignals: string[];
  recommendedAction: string | null;
  provider: string;
  model: string;
}

export interface PipelineOutcome {
  /** True when the run reached `completed` with a persisted decision. */
  recorded: boolean;
  eventId?: string;
  decisionId?: string;
  verdict?: FraudVerdict;
  confidenceScore?: number;
  /** Real error when any stage failed. */
  error?: string;
}

function env(name: string): string | undefined {
  const value = (globalThis as any).Deno?.env?.get(name);
  return value && value.length > 0 ? value : undefined;
}

const SUPABASE_URL = () => env('SUPABASE_URL');
const SERVICE_ROLE_KEY = () =>
  env('SUPABASE_SERVICE_ROLE_KEY') ?? env('SERVICE_ROLE_KEY');

/** True when this deployment can write to the fraud pipeline tables. */
export function isPipelineConfigured(): boolean {
  return Boolean(SUPABASE_URL() && SERVICE_ROLE_KEY());
}

async function rest<T>(path: string, init: RequestInit & { prefer?: string }): Promise<T> {
  const url = SUPABASE_URL();
  const key = SERVICE_ROLE_KEY();
  if (!url || !key) {
    throw new Error('Fraud pipeline is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: key,
    Authorization: 'Bearer ' + key,
  };
  if (init.prefer) headers['Prefer'] = init.prefer;

  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} failed with HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Resolve the UUID of the default pipeline, registering it if it is absent. */
async function resolvePipelineId(): Promise<string> {
  const found = await rest<Array<{ id: string }>>(
    `fraud_pipelines?select=id&name=eq.${encodeURIComponent(PIPELINE_NAME)}&limit=1`,
    { method: 'GET' },
  );
  if (found.length > 0) return found[0].id;

  const created = await rest<Array<{ id: string }>>('fraud_pipelines?on_conflict=name&select=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: JSON.stringify({
      name: PIPELINE_NAME,
      description: 'Default Valthoris fraud detection pipeline',
      is_active: true,
    }),
  });
  if (created.length === 0) throw new Error('Could not resolve the default fraud pipeline');
  return created[0].id;
}

/**
 * Insert (or re-use) the event for this artefact.
 * The id is derived from the submitting user and the artefact itself, so
 * re-submitting the same artefact never duplicates the event.
 */
async function upsertEvent(
  userId: string | null,
  artifact: DetectedArtifact,
  content: string,
): Promise<string> {
  const id = await deterministicUuid(
    `valthoris:ai-chat:${userId ?? 'anonymous'}:${artifact.eventType}:${artifact.value.toLowerCase()}`,
  );

  await rest<unknown>('fraud_events?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body: JSON.stringify({
      id,
      user_id: userId,
      event_type: artifact.eventType,
      payload: {
        content: artifact.value,
        source: 'ai-chat',
        metadata: {
          kind: artifact.kind,
          request: content.slice(0, 2_000),
          channel: 'ai-assistant',
        },
      },
    }),
  });

  return id;
}

async function upsertRun(
  eventId: string,
  pipelineId: string,
  status: 'running' | 'completed' | 'failed',
  startedAt: string,
  completedAt: string | null,
  errorMessage: string | null,
): Promise<void> {
  await rest<unknown>('fraud_workflow_runs?on_conflict=event_id,pipeline_id,mode', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({
      event_id: eventId,
      pipeline_id: pipelineId,
      mode: MODE,
      status,
      started_at: startedAt,
      completed_at: completedAt,
      error_message: errorMessage,
    }),
  });
}

async function writeDecision(
  eventId: string,
  pipelineId: string,
  analysis: StructuredAnalysis,
): Promise<string> {
  const rows = await rest<Array<{ id: string }>>(
    'fraud_decisions?on_conflict=event_id,pipeline_id,mode&select=id',
    {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify({
        event_id: eventId,
        pipeline_id: pipelineId,
        mode: MODE,
        verdict: analysis.verdict,
        confidence_score: analysis.confidenceScore,
        ai_provider: `${analysis.provider}:${analysis.model}`,
        ai_response_summary: analysis.justification.slice(0, 2_000),
      }),
    },
  );
  if (rows.length === 0) throw new Error('fraud_decisions upsert returned no row');
  const decisionId = rows[0].id;

  await rest<unknown>('fraud_decision_justifications?on_conflict=decision_id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: JSON.stringify({
      decision_id: decisionId,
      justification: analysis.justification,
      risk_signals: analysis.riskSignals,
      recommended_action: analysis.recommendedAction,
    }),
  });

  return decisionId;
}

/**
 * Parse a provider answer into a structured verdict.
 * Throws when the answer is not a valid verdict — the caller then records a
 * failed run and persists no decision.
 */
export function parseStructuredAnalysis(
  raw: string,
  provider: string,
  model: string,
): StructuredAnalysis {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error(`Analysis response is not valid JSON: ${cleaned.slice(0, 200)}`);
  }

  const verdict = parsed['verdict'];
  if (
    typeof verdict !== 'string' ||
    !['fraud', 'suspicious', 'legitimate', 'unknown'].includes(verdict)
  ) {
    throw new Error(`Analysis response has an invalid verdict: ${String(verdict)}`);
  }

  const rawScore = parsed['confidenceScore'];
  const confidenceScore = typeof rawScore === 'number' ? Math.round(rawScore) : NaN;
  if (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 100) {
    throw new Error(`Analysis response has an invalid confidenceScore: ${String(rawScore)}`);
  }

  const justification = parsed['justification'];
  if (typeof justification !== 'string' || justification.trim().length === 0) {
    throw new Error('Analysis response has no justification');
  }

  const rawSignals = parsed['riskSignals'];
  const riskSignals = Array.isArray(rawSignals)
    ? rawSignals.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];

  const rawAction = parsed['recommendedAction'];
  const recommendedAction =
    typeof rawAction === 'string' && rawAction.trim().length > 0 ? rawAction.trim() : null;

  return {
    verdict: verdict as FraudVerdict,
    confidenceScore,
    justification: justification.trim(),
    riskSignals,
    recommendedAction,
    provider,
    model,
  };
}

/**
 * Run and record a real security analysis.
 *
 * `analyse` performs the actual provider call; this function only persists what
 * that call produced. Any failure — provider, parsing or database — is recorded
 * on the workflow run with its real message and reported back to the caller.
 */
export async function recordSecurityAnalysis(
  userId: string | null,
  artifact: DetectedArtifact,
  requestText: string,
  analyse: () => Promise<StructuredAnalysis>,
): Promise<PipelineOutcome> {
  if (!isPipelineConfigured()) {
    return {
      recorded: false,
      error: 'Fraud pipeline is not configured (SUPABASE_SERVICE_ROLE_KEY missing)',
    };
  }

  const startedAt = new Date().toISOString();
  let eventId: string;
  let pipelineId: string;

  try {
    pipelineId = await resolvePipelineId();
    eventId = await upsertEvent(userId, artifact, requestText);
    await upsertRun(eventId, pipelineId, 'running', startedAt, null, null);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai-chat] fraud pipeline write failed', message);
    return { recorded: false, error: message };
  }

  let analysis: StructuredAnalysis;
  try {
    analysis = await analyse();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai-chat] security analysis failed', message);
    await upsertRun(
      eventId,
      pipelineId,
      'failed',
      startedAt,
      new Date().toISOString(),
      message,
    ).catch((e) => console.error('[ai-chat] could not record failed run', e));
    return { recorded: false, eventId, error: message };
  }

  try {
    const decisionId = await writeDecision(eventId, pipelineId, analysis);
    await upsertRun(eventId, pipelineId, 'completed', startedAt, new Date().toISOString(), null);
    return {
      recorded: true,
      eventId,
      decisionId,
      verdict: analysis.verdict,
      confidenceScore: analysis.confidenceScore,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ai-chat] decision persistence failed', message);
    await upsertRun(
      eventId,
      pipelineId,
      'failed',
      startedAt,
      new Date().toISOString(),
      message,
    ).catch((e) => console.error('[ai-chat] could not record failed run', e));
    return { recorded: false, eventId, error: message };
  }
}
