/**
 * fraud-worker/index.ts
 *
 * Entry point for the Valthoris Fraud Worker process.
 *
 * Run with:
 *   node dist/fraud-worker/index.js
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY        (or ANTHROPIC_API_KEY)
 *
 * Optional environment variables (see src/config/index.ts for defaults):
 *   AI_PROVIDER                        (openai | anthropic)
 *   FRAUD_WORKER_POLL_INTERVAL_MS
 *   FRAUD_WORKER_PIPELINE_ID
 *   FRAUD_WORKER_MODE                  (auto | manual)
 *   FRAUD_QUEUE_NAME
 *   PGMQ_VISIBILITY_TIMEOUT_SECONDS
 *   PGMQ_BATCH_SIZE
 */

import { FraudWorker, registerShutdownHandlers } from './FraudWorker';

async function main(): Promise<void> {
  console.log('[FraudWorker] Initialising...');

  let worker: FraudWorker;
  try {
    worker = FraudWorker.fromEnv();
  } catch (err) {
    console.error('[FraudWorker] Initialisation failed:', err);
    process.exit(1);
  }

  registerShutdownHandlers(worker);

  try {
    await worker.start();
  } catch (err) {
    console.error('[FraudWorker] Failed to start:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FraudWorker] Fatal error:', err);
  process.exit(1);
});
