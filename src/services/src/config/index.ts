/**
 * config/index.ts
 *
 * Centralised environment configuration for the Valthoris backend services.
 * All environment variables are read here; the rest of the codebase imports
 * typed configuration objects instead of accessing process.env directly.
 *
 * TODO: Set these variables in your deployment environment / .env file
 *       before running any service.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable "${name}" is not set`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (isNaN(parsed)) throw new Error(`Environment variable "${name}" must be a number`);
  return parsed;
}

// ─── Supabase ──────────────────────────────────────────────────────────────

export interface SupabaseConfig {
  /** Public project URL, e.g. https://<project>.supabase.co */
  url: string;
  /** Service-role secret key — never expose to the browser */
  serviceRoleKey: string;
}

export function supabaseConfig(): SupabaseConfig {
  return {
    // TODO: Set SUPABASE_URL to your Supabase project URL
    url: required('SUPABASE_URL'),
    // TODO: Set SUPABASE_SERVICE_ROLE_KEY to your service-role secret
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

// ─── AI ───────────────────────────────────────────────────────────────────

export type AiProviderName = 'openai' | 'anthropic';

export interface AiConfig {
  provider: AiProviderName;
  openaiApiKey?: string;
  openaiModel: string;
  anthropicApiKey?: string;
  anthropicModel: string;
}

export function aiConfig(): AiConfig {
  // TODO: Set AI_PROVIDER to 'openai' or 'anthropic'
  const provider = optional('AI_PROVIDER', 'openai') as AiProviderName;

  return {
    provider,
    // TODO: Set OPENAI_API_KEY if using OpenAI
    openaiApiKey: process.env['OPENAI_API_KEY'],
    openaiModel: optional('OPENAI_MODEL', 'gpt-4o-mini'),
    // TODO: Set ANTHROPIC_API_KEY if using Anthropic
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
    anthropicModel: optional('ANTHROPIC_MODEL', 'claude-3-5-haiku-20241022'),
  };
}

// ─── PGMQ ─────────────────────────────────────────────────────────────────

export interface PgmqConfig {
  /** Queue name for incoming fraud events */
  fraudQueueName: string;
  /**
   * Visibility timeout in seconds — a message consumed from the queue
   * will be hidden from other consumers for this duration.
   */
  visibilityTimeoutSeconds: number;
  /** Maximum messages per poll */
  batchSize: number;
}

export function pgmqConfig(): PgmqConfig {
  return {
    fraudQueueName: optional('FRAUD_QUEUE_NAME', 'valthoris_fraud_events'),
    visibilityTimeoutSeconds: optionalNumber('PGMQ_VISIBILITY_TIMEOUT_SECONDS', 60),
    batchSize: optionalNumber('PGMQ_BATCH_SIZE', 10),
  };
}

// ─── Fraud Worker ─────────────────────────────────────────────────────────

export interface FraudWorkerConfig {
  /** How often the worker polls the queue (milliseconds) */
  pollIntervalMs: number;
  /** Pipeline identifier for this worker instance */
  pipelineId: string;
  /** Operating mode: 'auto' runs unsupervised, 'manual' queues for review */
  mode: 'auto' | 'manual';
}

export function fraudWorkerConfig(): FraudWorkerConfig {
  const rawMode = optional('FRAUD_WORKER_MODE', 'auto');
  if (rawMode !== 'auto' && rawMode !== 'manual') {
    throw new Error('FRAUD_WORKER_MODE must be "auto" or "manual"');
  }
  return {
    pollIntervalMs: optionalNumber('FRAUD_WORKER_POLL_INTERVAL_MS', 5_000),
    // TODO: Set FRAUD_WORKER_PIPELINE_ID to a meaningful identifier
    pipelineId: optional('FRAUD_WORKER_PIPELINE_ID', 'default-pipeline-v1'),
    mode: rawMode,
  };
}

// ─── ICP ──────────────────────────────────────────────────────────────────

export interface IcpConfig {
  /** ICP replica host — mainnet: https://icp0.io, local: http://127.0.0.1:4943 */
  host: string;
  /** Community canister ID */
  communityCanisterId: string;
  /** ThreatIntelligence canister ID */
  threatIntelligenceCanisterId: string;
  /** How often the ingest service polls ICP canisters (milliseconds) */
  pollIntervalMs: number;
  /** Number of recent reports to fetch per poll */
  fetchBatchSize: number;
}

export function icpConfig(): IcpConfig {
  return {
    host: optional('ICP_HOST', 'https://icp0.io'),
    // TODO: Override with local canister IDs in development
    communityCanisterId: optional(
      'ICP_COMMUNITY_CANISTER_ID',
      '7w5qg-6aaaa-aaaab-ael4a-cai',
    ),
    threatIntelligenceCanisterId: optional(
      'ICP_THREAT_INTELLIGENCE_CANISTER_ID',
      'e2m3q-yqaaa-aaaas-qekva-cai',
    ),
    pollIntervalMs: optionalNumber('ICP_POLL_INTERVAL_MS', 30_000),
    fetchBatchSize: optionalNumber('ICP_FETCH_BATCH_SIZE', 50),
  };
}

// ─── Notifications ────────────────────────────────────────────────────────

export interface NotificationConfig {
  /**
   * Supabase Realtime channel prefix for fraud alerts.
   * Full channel name: `${prefix}:${userId}`
   */
  fraudAlertChannelPrefix: string;
}

export function notificationConfig(): NotificationConfig {
  return {
    fraudAlertChannelPrefix: optional(
      'NOTIFICATION_FRAUD_ALERT_CHANNEL_PREFIX',
      'fraud-alert',
    ),
  };
}
