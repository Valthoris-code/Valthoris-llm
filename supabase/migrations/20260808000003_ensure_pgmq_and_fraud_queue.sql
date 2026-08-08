-- Ensure pgmq extension and fraud queue exist
--
-- This migration is fully idempotent and non-destructive:
--   • It enables the pgmq extension only if it is not already installed.
--   • It creates the fraud queue only if it does not already exist.
--   • It never drops, purges, or renames an existing queue.
--
-- The queue name must match the default in config/index.ts:
--   fraudQueueName: optional('FRAUD_QUEUE_NAME', 'valthoris_fraud_events')
-- and can be overridden at runtime via the FRAUD_QUEUE_NAME environment variable.

-- Enable the pgmq extension if not already installed.
-- pgmq is available on all Supabase projects via the extensions dashboard
-- or via this SQL statement.
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create the fraud event queue if it does not already exist.
-- pgmq.create() is idempotent in pgmq ≥ 1.x; older builds may raise an error
-- if the queue already exists, so we guard with an existence check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pgmq.meta
    WHERE queue_name = 'valthoris_fraud_events'
  ) THEN
    PERFORM pgmq.create('valthoris_fraud_events');
  END IF;
END $$;
