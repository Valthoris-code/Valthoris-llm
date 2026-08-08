/**
 * icp-fraud-ingest/IcpFraudIngestService.ts
 *
 * Polls the ICP canisters (Community + ThreatIntelligence) for new fraud
 * reports / threat entries and enqueues them into the fraud-worker queue
 * via pgmq.
 *
 * De-duplication strategy:
 *   A Set of already-enqueued ICP report IDs is kept in memory.
 *   On startup the service loads the IDs from the `icp_ingest_cursors` table.
 *
 * TODO: Create the `icp_ingest_cursors` table in your Supabase schema, or
 *       replace this with any other persistence strategy.
 *       Expected schema:
 *         id TEXT PRIMARY KEY,       -- cursor identifier (e.g. "community" / "threat")
 *         last_processed_id TEXT,    -- last ICP report/entry ID processed
 *         processed_count BIGINT,
 *         updated_at TIMESTAMPTZ
 */

import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { IPgmqAdapter } from '../adapters/pgmq/IPgmqAdapter';
import { SupabasePgmqAdapter } from '../adapters/pgmq/SupabasePgmqAdapter';
import { IAuditService } from '../services/audit/IAuditService';
import { SupabaseAuditService } from '../services/audit/SupabaseAuditService';
import { IcpActors, createIcpActors } from './IcpCanisters';
import { IcpReport, icpVariantKey, icpTimestampToDate } from '../types/icp';
import {
  supabaseConfig,
  pgmqConfig,
  icpConfig,
  IcpConfig,
  PgmqConfig,
} from '../config';

/** Payload format that matches FraudQueueMessage in FraudWorker.ts */
interface FraudQueueMessage {
  eventId: string;
  userId: string | null;
  eventType: string;
  content: string;
  metadata?: Record<string, unknown>;
  source: string;
  createdAt: string;
}

/** Cursor row from `icp_ingest_cursors` */
interface IngestCursorRow {
  id: string;
  last_processed_id: string | null;
  processed_count: number;
  updated_at: string;
}

const CURSOR_COMMUNITY = 'community';
const CURSOR_THREAT = 'threat_intelligence';

/** Map ICP community report category to FraudEventType */
function reportCategoryToEventType(category: IcpReport['category']): string {
  const key = icpVariantKey(category as Record<string, unknown>);
  const map: Record<string, string> = {
    phishing: 'url',
    smishing: 'sms',
    scam: 'unknown',
    malware: 'file',
    spam: 'sms',
    fraud: 'unknown',
    impersonation: 'unknown',
    cryptoFraud: 'wallet_address',
    other: 'unknown',
  };
  return map[key] ?? 'unknown';
}

export class IcpFraudIngestService {
  private readonly processedIds = new Map<string, Set<string>>([
    [CURSOR_COMMUNITY, new Set()],
    [CURSOR_THREAT, new Set()],
  ]);
  private readonly processedCounts = new Map<string, number>([
    [CURSOR_COMMUNITY, 0],
    [CURSOR_THREAT, 0],
  ]);

  private stopping = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly pgmq: IPgmqAdapter,
    private readonly audit: IAuditService,
    private readonly actors: IcpActors,
    private readonly icpCfg: IcpConfig,
    private readonly queueCfg: PgmqConfig,
  ) {}

  /** Factory: build from environment variables */
  static fromEnv(): IcpFraudIngestService {
    const sc = supabaseConfig();
    const supabase = createClient(sc.url, sc.serviceRoleKey, {
      auth: { persistSession: false },
    });

    const pgmq = new SupabasePgmqAdapter(supabase);
    const audit = new SupabaseAuditService(supabase);
    const cfg = icpConfig();
    const actors = createIcpActors(
      cfg.host,
      cfg.communityCanisterId,
      cfg.threatIntelligenceCanisterId,
    );

    return new IcpFraudIngestService(
      supabase,
      pgmq,
      audit,
      actors,
      cfg,
      pgmqConfig(),
    );
  }

  async start(): Promise<void> {
    this.stopping = false;

    await this.pgmq.ensureQueue(this.queueCfg.fraudQueueName);
    await this.loadCursors();

    await this.audit.log({
      actor: 'IcpFraudIngestService',
      action: 'ingest.started',
      metadata: { host: this.icpCfg.host, pollIntervalMs: this.icpCfg.pollIntervalMs },
    });

    console.log(
      `[IcpFraudIngestService] Started — host: ${this.icpCfg.host}, ` +
        `poll: ${this.icpCfg.pollIntervalMs}ms`,
    );

    this.schedulePoll();
  }

  async stop(): Promise<void> {
    this.stopping = true;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    await this.audit.log({
      actor: 'IcpFraudIngestService',
      action: 'ingest.stopped',
    });

    console.log('[IcpFraudIngestService] Stopped');
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private schedulePoll(): void {
    if (this.stopping) return;

    this.pollTimer = setTimeout(() => {
      this.poll()
        .catch((err: unknown) =>
          console.error('[IcpFraudIngestService] Unhandled error during poll:', err),
        )
        .finally(() => this.schedulePoll());
    }, this.icpCfg.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (this.stopping) return;

    const [communityCount, threatCount] = await Promise.all([
      this.ingestCommunityReports(),
      this.ingestThreatEntries(),
    ]);

    if (communityCount + threatCount > 0) {
      console.log(
        `[IcpFraudIngestService] Enqueued ${communityCount} community report(s) ` +
          `and ${threatCount} threat entry(ies)`,
      );
    }
  }

  private async ingestCommunityReports(): Promise<number> {
    let reports: IcpReport[];

    try {
      reports = await this.actors.community.listRecentReports(
        BigInt(this.icpCfg.fetchBatchSize),
      );
    } catch (err) {
      console.error('[IcpFraudIngestService] Failed to fetch community reports:', err);
      return 0;
    }

    const seen = this.processedIds.get(CURSOR_COMMUNITY)!;
    const newReports = reports.filter((r) => !seen.has(r.id));

    if (newReports.length === 0) return 0;

    const messages: FraudQueueMessage[] = newReports.map((r) => ({
      eventId: `icp:community:${r.id}`,
      userId: null, // ICP principals are not Supabase user IDs
      eventType: reportCategoryToEventType(r.category),
      content: `${r.description}\nTarget: ${r.target}`,
      metadata: {
        icpReportId: r.id,
        reporter: r.reporter,
        category: icpVariantKey(r.category as Record<string, unknown>),
        riskScore: Number(r.riskScore),
        confirmVotes: Number(r.confirmVotes),
        rejectVotes: Number(r.rejectVotes),
        evidence: r.evidence.length > 0 ? r.evidence[0] : null,
      },
      source: 'icp:community',
      createdAt: icpTimestampToDate(r.createdAt).toISOString(),
    }));

    await this.pgmq.sendBatch(this.queueCfg.fraudQueueName, messages);

    newReports.forEach((r) => seen.add(r.id));
    const lastProcessedId = newReports[newReports.length - 1]?.id ?? null;
    await this.persistCursor(CURSOR_COMMUNITY, lastProcessedId, newReports.length);

    return newReports.length;
  }

  private async ingestThreatEntries(): Promise<number> {
    let entries: Awaited<ReturnType<IcpActors['threatIntelligence']['listActiveThreats']>>;

    try {
      entries = await this.actors.threatIntelligence.listActiveThreats(
        BigInt(this.icpCfg.fetchBatchSize),
      );
    } catch (err) {
      console.error('[IcpFraudIngestService] Failed to fetch threat entries:', err);
      return 0;
    }

    const seen = this.processedIds.get(CURSOR_THREAT)!;
    const newEntries = entries.filter((e) => !seen.has(e.id));

    if (newEntries.length === 0) return 0;

    const messages: FraudQueueMessage[] = newEntries.map((e) => ({
      eventId: `icp:threat:${e.id}`,
      userId: null,
      eventType: this.indicatorTypeToEventType(
        icpVariantKey(e.indicatorType as Record<string, unknown>),
      ),
      content: e.indicator,
      metadata: {
        icpThreatId: e.id,
        category: icpVariantKey(e.category as Record<string, unknown>),
        severity: icpVariantKey(e.severity as Record<string, unknown>),
        confidence: Number(e.confidence),
        tags: e.tags,
        description: e.description,
      },
      source: 'icp:threat_intelligence',
      createdAt: icpTimestampToDate(e.reportedAt).toISOString(),
    }));

    await this.pgmq.sendBatch(this.queueCfg.fraudQueueName, messages);

    newEntries.forEach((e) => seen.add(e.id));
    const lastProcessedId = newEntries[newEntries.length - 1]?.id ?? null;
    await this.persistCursor(CURSOR_THREAT, lastProcessedId, newEntries.length);

    return newEntries.length;
  }

  private indicatorTypeToEventType(indicatorType: string): string {
    const map: Record<string, string> = {
      url: 'url',
      ip: 'url',
      domain: 'url',
      fileHash: 'file',
      email: 'email',
      walletAddress: 'wallet_address',
    };
    return map[indicatorType] ?? 'unknown';
  }

  /**
   * Load previously processed IDs from the `icp_ingest_cursors` table.
   * If the table does not exist, we start fresh (log a warning).
   */
  private async loadCursors(): Promise<void> {
    const { data, error } = await this.supabase
      .from('icp_ingest_cursors')
      .select('id, last_processed_id, processed_count, updated_at');

    if (error) {
      // TODO: Create the icp_ingest_cursors table in your Supabase schema
      console.warn(
        '[IcpFraudIngestService] Could not load cursors (table may not exist):',
        error.message,
      );
      return;
    }

    for (const row of (data as IngestCursorRow[] | null) ?? []) {
      const set = this.processedIds.get(row.id);
      if (set && row.last_processed_id) {
        set.add(row.last_processed_id);
      }
      if (this.processedCounts.has(row.id)) {
        this.processedCounts.set(row.id, Number(row.processed_count) || 0);
      }
    }
  }

  private async persistCursor(
    cursorId: string,
    lastProcessedId: string | null,
    newCount: number,
  ): Promise<void> {
    const previousCount = this.processedCounts.get(cursorId) ?? 0;
    const cumulativeCount = previousCount + newCount;

    const { error } = await this.supabase.from('icp_ingest_cursors').upsert(
      {
        id: cursorId,
        last_processed_id: lastProcessedId,
        processed_count: cumulativeCount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

    if (error) {
      // Non-critical — log and continue
      console.warn('[IcpFraudIngestService] Could not persist cursor:', error.message);
      return;
    }

    this.processedCounts.set(cursorId, cumulativeCount);
  }
}
