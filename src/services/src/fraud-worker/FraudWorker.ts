/**
 * fraud-worker/FraudWorker.ts
 *
 * Main worker process for the Valthoris fraud detection pipeline.
 *
 * Architecture:
 *   - Polls the pgmq queue (`valthoris_fraud_events` by default) on a fixed interval.
 *   - Processes messages in batches (sequential within each poll cycle).
 *   - Archives each message after successful processing.
 *   - Moves failed messages back to the queue (visibility timeout expires naturally).
 *
 * Graceful shutdown:
 *   - Call stop() to prevent new poll cycles.
 *   - The worker finishes the current batch before exiting.
 *   - Listens for SIGINT/SIGTERM by default.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { FraudEvent, FraudEventType, FraudEventPayload, WorkerStats } from '../types/fraud';
import { IPgmqAdapter } from '../adapters/pgmq/IPgmqAdapter';
import { SupabasePgmqAdapter } from '../adapters/pgmq/SupabasePgmqAdapter';
import { IRealtimeEmitter } from '../adapters/realtime/IRealtimeEmitter';
import { SupabaseRealtimeEmitter } from '../adapters/realtime/SupabaseRealtimeEmitter';
import { IAuditService } from '../services/audit/IAuditService';
import { SupabaseAuditService } from '../services/audit/SupabaseAuditService';
import { INotificationService } from '../services/notifications/INotificationService';
import { SupabaseNotificationService } from '../services/notifications/SupabaseNotificationService';
import { AiService } from '../services/ai/AiService';
import { FraudPipeline } from './pipeline/FraudPipeline';
import {
  supabaseConfig,
  pgmqConfig,
  fraudWorkerConfig,
  aiConfig,
  notificationConfig,
  FraudWorkerConfig,
  PgmqConfig,
  NotificationConfig,
} from '../config';

/** Shape of the message body stored in pgmq for a fraud event */
interface FraudQueueMessage {
  eventId: string;
  userId: string | null;
  eventType: string;
  content: string;
  metadata?: Record<string, unknown>;
  source?: string;
  createdAt: string;
}

export class FraudWorker {
  private readonly supabase: SupabaseClient;
  private readonly pgmq: IPgmqAdapter;
  private readonly realtime: IRealtimeEmitter;
  private readonly audit: IAuditService;
  private readonly notifications: INotificationService;
  private readonly pipeline: FraudPipeline;
  private readonly workerConfig: FraudWorkerConfig;
  private readonly queueConfig: PgmqConfig;
  private readonly notifConfig: NotificationConfig;

  private _stats: WorkerStats = {
    status: 'idle',
    totalProcessed: 0,
    totalErrors: 0,
    lastProcessedAt: null,
    startedAt: null,
  };

  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private stopping = false;

  constructor(
    supabase: SupabaseClient,
    pgmq: IPgmqAdapter,
    realtime: IRealtimeEmitter,
    audit: IAuditService,
    notifications: INotificationService,
    ai: AiService,
    workerConfig: FraudWorkerConfig,
    queueConfig: PgmqConfig,
    notifConfig: NotificationConfig,
  ) {
    this.supabase = supabase;
    this.pgmq = pgmq;
    this.realtime = realtime;
    this.audit = audit;
    this.notifications = notifications;
    this.workerConfig = workerConfig;
    this.queueConfig = queueConfig;
    this.notifConfig = notifConfig;

    this.pipeline = new FraudPipeline(
      supabase,
      ai,
      audit,
      notifications,
      realtime,
      notifConfig,
      { pipelineId: workerConfig.pipelineId, mode: workerConfig.mode },
    );
  }

  /** Factory: build a FraudWorker from environment variables */
  static fromEnv(): FraudWorker {
    const sc = supabaseConfig();
    const supabase = createClient(sc.url, sc.serviceRoleKey, {
      auth: { persistSession: false },
    });

    const pgmq = new SupabasePgmqAdapter(supabase);
    const realtime = new SupabaseRealtimeEmitter(supabase);
    const audit = new SupabaseAuditService(supabase);
    const notifConfig = notificationConfig();
    const notifications = new SupabaseNotificationService(supabase, realtime, notifConfig);
    const ai = AiService.fromConfig(aiConfig());
    const workerConfig = fraudWorkerConfig();
    const queueConfig = pgmqConfig();

    return new FraudWorker(
      supabase,
      pgmq,
      realtime,
      audit,
      notifications,
      ai,
      workerConfig,
      queueConfig,
      notifConfig,
    );
  }

  get stats(): Readonly<WorkerStats> {
    return { ...this._stats };
  }

  /** Start the worker and begin polling the queue */
  async start(): Promise<void> {
    if (this._stats.status === 'running') {
      throw new Error('FraudWorker is already running');
    }

    this.stopping = false;
    this._stats = {
      ...this._stats,
      status: 'running',
      startedAt: new Date(),
    };

    // Ensure the queue exists before starting
    await this.pgmq.ensureQueue(this.queueConfig.fraudQueueName);

    await this.audit.log({
      actor: 'FraudWorker',
      action: 'worker.started',
      metadata: {
        pipelineId: this.workerConfig.pipelineId,
        mode: this.workerConfig.mode,
        pollIntervalMs: this.workerConfig.pollIntervalMs,
      },
    });

    console.log(
      `[FraudWorker] Started — pipeline: ${this.workerConfig.pipelineId}, ` +
        `mode: ${this.workerConfig.mode}, queue: ${this.queueConfig.fraudQueueName}`,
    );

    this.schedulePoll();
  }

  /** Stop the worker gracefully */
  async stop(): Promise<void> {
    this.stopping = true;
    this._stats.status = 'stopping';

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    this._stats.status = 'stopped';

    await this.audit.log({
      actor: 'FraudWorker',
      action: 'worker.stopped',
      metadata: {
        totalProcessed: this._stats.totalProcessed,
        totalErrors: this._stats.totalErrors,
      },
    });

    console.log('[FraudWorker] Stopped');
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private schedulePoll(): void {
    if (this.stopping) return;

    this.pollTimer = setTimeout(() => {
      this.poll()
        .catch((err: unknown) =>
          console.error('[FraudWorker] Unhandled error during poll:', err),
        )
        .finally(() => this.schedulePoll());
    }, this.workerConfig.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (this.stopping) return;

    const messages = await this.pgmq.read<FraudQueueMessage>(
      this.queueConfig.fraudQueueName,
      this.queueConfig.visibilityTimeoutSeconds,
      this.queueConfig.batchSize,
    );

    if (messages.length === 0) return;

    console.log(`[FraudWorker] Received ${messages.length} message(s)`);

    for (const msg of messages) {
      if (this.stopping) break;

      try {
        const event = this.queueMessageToFraudEvent(msg.body);
        await this.pipeline.run(event);
        await this.pgmq.archive(this.queueConfig.fraudQueueName, msg.msgId);

        this._stats.totalProcessed++;
        this._stats.lastProcessedAt = new Date();
      } catch (err) {
        this._stats.totalErrors++;
        const errorMessage = err instanceof Error ? err.message : String(err);

        console.error(
          `[FraudWorker] Failed to process message ${msg.msgId}:`,
          errorMessage,
        );

        await this.audit
          .error({
            actor: 'FraudWorker',
            action: 'worker.message.failed',
            resourceId: msg.body.eventId,
            metadata: { msgId: msg.msgId, error: errorMessage },
          })
          .catch(() => undefined);

        // Message visibility timeout will expire and it will be retried automatically
      }
    }
  }

  private queueMessageToFraudEvent(msg: FraudQueueMessage): FraudEvent {
    const payload: FraudEventPayload = {
      content: msg.content,
      metadata: msg.metadata,
      source: msg.source,
    };

    return {
      id: msg.eventId,
      userId: msg.userId,
      eventType: (msg.eventType as FraudEventType) ?? 'unknown',
      payload,
      createdAt: new Date(msg.createdAt),
    };
  }
}

/** Register SIGINT / SIGTERM handlers for graceful shutdown */
export function registerShutdownHandlers(worker: FraudWorker): void {
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[FraudWorker] Received ${signal}, shutting down...`);
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}
