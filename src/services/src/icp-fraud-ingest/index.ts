/**
 * icp-fraud-ingest/index.ts
 *
 * Entry point for the Valthoris ICP Fraud Ingest process.
 *
 * Run with:
 *   node dist/icp-fraud-ingest/index.js
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional environment variables (see src/config/index.ts for defaults):
 *   ICP_HOST
 *   ICP_COMMUNITY_CANISTER_ID
 *   ICP_THREAT_INTELLIGENCE_CANISTER_ID
 *   ICP_POLL_INTERVAL_MS
 *   ICP_FETCH_BATCH_SIZE
 *   FRAUD_QUEUE_NAME
 */

import { IcpFraudIngestService } from './IcpFraudIngestService';

async function main(): Promise<void> {
  console.log('[IcpFraudIngestService] Initialising...');

  let service: IcpFraudIngestService;
  try {
    service = IcpFraudIngestService.fromEnv();
  } catch (err) {
    console.error('[IcpFraudIngestService] Initialisation failed:', err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[IcpFraudIngestService] Received ${signal}, shutting down...`);
    await service.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await service.start();
  } catch (err) {
    console.error('[IcpFraudIngestService] Failed to start:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[IcpFraudIngestService] Fatal error:', err);
  process.exit(1);
});
