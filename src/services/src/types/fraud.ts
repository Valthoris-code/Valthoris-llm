/**
 * types/fraud.ts
 *
 * Domain types for the Valthoris fraud detection pipeline.
 * These are the canonical in-memory types used throughout the services layer.
 * They map to / from the database row types in database.ts.
 */

// ─── Fraud event (queue payload) ──────────────────────────────────────────

export type FraudEventType =
  | 'sms'
  | 'url'
  | 'email'
  | 'qr_code'
  | 'file'
  | 'phone_number'
  | 'iban'
  | 'wallet_address'
  | 'icp_report'
  | 'community_report'
  | 'unknown';

export interface FraudEvent {
  /** Matches `fraud_events.id` */
  id: string;
  userId: string | null;
  eventType: FraudEventType;
  /** Raw content to be analysed */
  payload: FraudEventPayload;
  createdAt: Date;
}

export interface FraudEventPayload {
  /** Primary content to analyse (URL, SMS text, etc.) */
  content: string;
  /** Supporting metadata */
  metadata?: Record<string, unknown>;
  /** Source system that created the event (e.g. 'icp', 'autoshield', 'api') */
  source?: string;
}

// ─── Fraud verdict ────────────────────────────────────────────────────────

export type FraudVerdict = 'fraud' | 'suspicious' | 'legitimate' | 'unknown';

/** Risk level derived from verdict + confidence */
export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'none';

export function verdictToRiskLevel(verdict: FraudVerdict, confidence: number): RiskLevel {
  if (verdict === 'fraud') {
    if (confidence >= 80) return 'critical';
    if (confidence >= 60) return 'high';
    return 'medium';
  }
  if (verdict === 'suspicious') {
    if (confidence >= 70) return 'high';
    return 'medium';
  }
  if (verdict === 'legitimate') return 'none';
  return 'low';
}

// ─── Pipeline result ──────────────────────────────────────────────────────

export interface FraudAnalysisResult {
  verdict: FraudVerdict;
  /** 0–100 */
  confidenceScore: number;
  justification: string;
  riskSignals: string[];
  recommendedAction: string | null;
  aiProvider: string;
  aiResponseSummary: string;
}

export interface FraudPipelineResult {
  workflowRunId: string;
  decisionId: string;
  event: FraudEvent;
  analysis: FraudAnalysisResult;
  riskLevel: RiskLevel;
  pipelineId: string;
  mode: 'auto' | 'manual';
  completedAt: Date;
}

// ─── Worker state ─────────────────────────────────────────────────────────

export type WorkerStatus = 'idle' | 'running' | 'stopping' | 'stopped';

export interface WorkerStats {
  status: WorkerStatus;
  totalProcessed: number;
  totalErrors: number;
  lastProcessedAt: Date | null;
  startedAt: Date | null;
}
