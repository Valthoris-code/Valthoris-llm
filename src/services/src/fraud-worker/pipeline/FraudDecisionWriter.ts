/**
 * fraud-worker/pipeline/FraudDecisionWriter.ts
 *
 * Persists the result of a fraud analysis to the Supabase database.
 *
 * Writes to:
 *   - fraud_workflow_runs  (upsert on event_id + pipeline_id + mode)
 *   - fraud_decisions      (upsert on event_id + pipeline_id + mode)
 *   - fraud_decision_justifications (upsert on decision_id)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { FraudAnalysisResult } from '../../types/fraud';
import {
  FraudWorkflowRunInsert,
  FraudDecisionInsert,
  FraudDecisionJustificationInsert,
} from '../../types/database';
import { PipelineContext } from './FraudPipelineTypes';

export interface WrittenDecision {
  workflowRunId: string;
  decisionId: string;
}

export class FraudDecisionWriter {
  constructor(private readonly supabase: SupabaseClient) {}

  /**
   * Persist the completed pipeline run and its decision.
   * Uses UPSERT semantics so retries are idempotent.
   */
  async write(
    context: PipelineContext,
    analysis: FraudAnalysisResult,
    completedAt: Date,
  ): Promise<WrittenDecision> {
    // 1. Mark the workflow run as completed
    const workflowRun = await this.upsertWorkflowRun(context, 'completed', completedAt);

    // 2. Write the decision
    const decision = await this.upsertDecision(context, analysis);

    // 3. Write the justification
    await this.upsertJustification(decision.id, analysis);

    return {
      workflowRunId: workflowRun.id,
      decisionId: decision.id,
    };
  }

  /**
   * Record a failed pipeline run in the database.
   */
  async writeFailed(
    context: PipelineContext,
    errorMessage: string,
  ): Promise<void> {
    await this.upsertWorkflowRun(context, 'failed', new Date(), errorMessage);
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private async upsertWorkflowRun(
    context: PipelineContext,
    status: string,
    completedAt: Date,
    errorMessage?: string,
  ): Promise<{ id: string }> {
    const row: FraudWorkflowRunInsert = {
      event_id: context.event.id,
      pipeline_id: context.pipelineId,
      mode: context.mode,
      status,
      started_at: context.startedAt,
      completed_at: completedAt.toISOString(),
      error_message: errorMessage ?? null,
    };

    const { data, error } = await this.supabase
      .from('fraud_workflow_runs')
      .upsert(row, {
        onConflict: 'event_id,pipeline_id,mode',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to upsert fraud_workflow_run: ${error.message}`);
    }

    return data as { id: string };
  }

  private async upsertDecision(
    context: PipelineContext,
    analysis: FraudAnalysisResult,
  ): Promise<{ id: string }> {
    const row: FraudDecisionInsert = {
      event_id: context.event.id,
      pipeline_id: context.pipelineId,
      mode: context.mode,
      verdict: analysis.verdict,
      confidence_score: analysis.confidenceScore,
      ai_provider: analysis.aiProvider,
      ai_response_summary: analysis.aiResponseSummary.slice(0, 500),
    };

    const { data, error } = await this.supabase
      .from('fraud_decisions')
      .upsert(row, {
        onConflict: 'event_id,pipeline_id,mode',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to upsert fraud_decision: ${error.message}`);
    }

    return data as { id: string };
  }

  private async upsertJustification(
    decisionId: string,
    analysis: FraudAnalysisResult,
  ): Promise<void> {
    const row: FraudDecisionJustificationInsert = {
      decision_id: decisionId,
      justification: analysis.justification,
      risk_signals: analysis.riskSignals,
      recommended_action: analysis.recommendedAction,
    };

    const { error } = await this.supabase
      .from('fraud_decision_justifications')
      .upsert(row, {
        onConflict: 'decision_id',
        ignoreDuplicates: false,
      });

    if (error) {
      throw new Error(`Failed to upsert fraud_decision_justification: ${error.message}`);
    }
  }
}
