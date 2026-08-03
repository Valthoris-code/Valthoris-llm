/**
 * fraud-worker/pipeline/FraudPipeline.ts
 *
 * Orchestrates a complete fraud detection run for a single FraudEvent.
 *
 * Pipeline stages:
 *   1.  Create workflow run record (status: running)
 *   2.  Analyse the event with the AI service
 *   3.  Persist the decision and justification
 *   4.  Emit a real-time event to the frontend
 *   5.  Send a notification if the risk level is ≥ medium
 *   6.  Write an audit log entry
 *
 * Failures in stages 4–6 are logged but do not abort the pipeline so that
 * the core fraud decision is always persisted.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { FraudEvent, FraudPipelineResult, RiskLevel, verdictToRiskLevel } from '../../types/fraud';
import { AiService } from '../../services/ai/AiService';
import { IAuditService } from '../../services/audit/IAuditService';
import { INotificationService } from '../../services/notifications/INotificationService';
import { IRealtimeEmitter } from '../../adapters/realtime/IRealtimeEmitter';
import { FraudAnalyzer } from './FraudAnalyzer';
import { FraudDecisionWriter } from './FraudDecisionWriter';
import { PipelineContext } from './FraudPipelineTypes';
import { NotificationConfig } from '../../config';

/** Minimum risk level at which a user notification is sent */
const NOTIFY_THRESHOLD: RiskLevel[] = ['medium', 'high', 'critical'];

export interface FraudPipelineOptions {
  pipelineId: string;
  mode: 'auto' | 'manual';
}

export class FraudPipeline {
  private readonly analyzer: FraudAnalyzer;
  private readonly writer: FraudDecisionWriter;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly ai: AiService,
    private readonly audit: IAuditService,
    private readonly notifications: INotificationService,
    private readonly realtime: IRealtimeEmitter,
    private readonly notificationConfig: NotificationConfig,
    private readonly options: FraudPipelineOptions,
  ) {
    this.analyzer = new FraudAnalyzer(ai);
    this.writer = new FraudDecisionWriter(supabase);
  }

  async run(event: FraudEvent): Promise<FraudPipelineResult> {
    const startedAt = new Date().toISOString();
    const context: PipelineContext = {
      event,
      pipelineId: this.options.pipelineId,
      mode: this.options.mode,
      workflowRunId: '', // filled after DB write
      startedAt,
    };

    // Stage 1: Mark run as started (best-effort — don't abort on error)
    await this.markRunStarted(context).catch((err: unknown) =>
      console.warn('[FraudPipeline] Could not mark run as started:', err),
    );

    // Stage 2: AI analysis
    let analysis;
    try {
      analysis = await this.analyzer.analyse(event.eventType, event.payload);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.writer.writeFailed(context, errorMessage).catch(() => undefined);
      await this.audit
        .error({
          actor: 'FraudPipeline',
          action: 'fraud.analysis.failed',
          resourceId: event.id,
          metadata: { error: errorMessage, eventType: event.eventType },
        })
        .catch(() => undefined);
      throw err;
    }

    // Stage 3: Persist decision
    const completedAt = new Date();
    const written = await this.writer.write(context, analysis, completedAt);
    context.workflowRunId = written.workflowRunId;

    const riskLevel = verdictToRiskLevel(analysis.verdict, analysis.confidenceScore);

    const result: FraudPipelineResult = {
      workflowRunId: written.workflowRunId,
      decisionId: written.decisionId,
      event,
      analysis,
      riskLevel,
      pipelineId: this.options.pipelineId,
      mode: this.options.mode,
      completedAt,
    };

    // Stage 4: Realtime broadcast (best-effort)
    await this.broadcastResult(result).catch((err: unknown) =>
      console.warn('[FraudPipeline] Realtime broadcast failed:', err),
    );

    // Stage 5: Notification (best-effort)
    if (NOTIFY_THRESHOLD.includes(riskLevel)) {
      await this.sendNotification(result).catch((err: unknown) =>
        console.warn('[FraudPipeline] Notification failed:', err),
      );
    }

    // Stage 6: Audit log (best-effort)
    await this.audit
      .log({
        actor: 'FraudPipeline',
        action: 'fraud.decision.created',
        resourceId: written.decisionId,
        metadata: {
          eventId: event.id,
          eventType: event.eventType,
          verdict: analysis.verdict,
          confidenceScore: analysis.confidenceScore,
          riskLevel,
          pipelineId: this.options.pipelineId,
          mode: this.options.mode,
        },
      })
      .catch(() => undefined);

    return result;
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private async markRunStarted(context: PipelineContext): Promise<void> {
    const { error } = await this.supabase.from('fraud_workflow_runs').upsert(
      {
        event_id: context.event.id,
        pipeline_id: context.pipelineId,
        mode: context.mode,
        status: 'running',
        started_at: context.startedAt,
        completed_at: null,
        error_message: null,
      },
      { onConflict: 'event_id,pipeline_id,mode' },
    );

    if (error) {
      throw new Error(`markRunStarted failed: ${error.message}`);
    }
  }

  private async broadcastResult(result: FraudPipelineResult): Promise<void> {
    const channel = result.event.userId
      ? `${this.notificationConfig.fraudAlertChannelPrefix}:${result.event.userId}`
      : `${this.notificationConfig.fraudAlertChannelPrefix}:global`;

    await this.realtime.broadcast({
      channel,
      event: 'fraud.decision.created',
      payload: {
        decisionId: result.decisionId,
        eventId: result.event.id,
        verdict: result.analysis.verdict,
        confidenceScore: result.analysis.confidenceScore,
        riskLevel: result.riskLevel,
        riskSignals: result.analysis.riskSignals,
        recommendedAction: result.analysis.recommendedAction,
        completedAt: result.completedAt.toISOString(),
      },
    });
  }

  private async sendNotification(result: FraudPipelineResult): Promise<void> {
    if (!result.event.userId) return;

    const titles: Record<RiskLevel, string> = {
      critical: '⚠️ CRITICAL: Fraud Detected',
      high: '🚨 HIGH RISK: Fraud Detected',
      medium: '⚠️ WARNING: Suspicious Activity',
      low: 'ℹ️ Low-risk Flag',
      none: 'ℹ️ No Fraud Detected',
    };

    await this.notifications.send({
      userId: result.event.userId,
      type: 'fraud_alert',
      title: titles[result.riskLevel],
      body: result.analysis.justification,
      data: {
        decisionId: result.decisionId,
        eventId: result.event.id,
        verdict: result.analysis.verdict,
        riskLevel: result.riskLevel,
        recommendedAction: result.analysis.recommendedAction,
      },
    });
  }
}
