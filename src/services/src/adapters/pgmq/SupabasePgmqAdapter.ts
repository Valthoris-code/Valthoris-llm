/**
 * adapters/pgmq/SupabasePgmqAdapter.ts
 *
 * Supabase implementation of IPgmqAdapter.
 *
 * pgmq is installed as a PostgreSQL extension in Supabase and its functions
 * are exposed under the `pgmq` schema. This adapter calls them via the
 * Supabase PostgREST RPC interface (`supabase.rpc()`).
 *
 * Function signatures used (pgmq extension API):
 *   pgmq.create(queue_name TEXT) → VOID
 *   pgmq.send(queue_name TEXT, msg JSONB, sleep_seconds INT = 0) → BIGINT
 *   pgmq.send_batch(queue_name TEXT, msgs JSONB[], sleep_seconds INT = 0) → SETOF BIGINT
 *   pgmq.read(queue_name TEXT, vt INT, qty INT) → SETOF pgmq.message_record
 *   pgmq.delete(queue_name TEXT, msg_id BIGINT) → BOOLEAN
 *   pgmq.archive(queue_name TEXT, msg_id BIGINT) → BOOLEAN
 *   pgmq.archive(queue_name TEXT, msg_ids BIGINT[]) → SETOF BOOLEAN
 *
 * TODO: If your Supabase version uses a different schema or function names,
 *       update the rpc() call names in this file accordingly.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { IPgmqAdapter, PgmqMessage } from './IPgmqAdapter';

/** Raw row returned by pgmq.read() */
interface PgmqMessageRecord {
  msg_id: number;
  read_ct: number;
  enqueued_at: string;
  vt: string;
  message: unknown;
}

export class SupabasePgmqAdapter implements IPgmqAdapter {
  constructor(private readonly supabase: SupabaseClient) {}

  async ensureQueue(queueName: string): Promise<void> {
    // pgmq.create is idempotent in recent versions; it will not throw if the
    // queue already exists. Older versions may raise an error — we catch it
    // and treat a duplicate queue as a success.
    const { error } = await this.supabase.rpc('pgmq_create', {
      queue_name: queueName,
    });

    if (error && !error.message.includes('already exists')) {
      throw new Error(`pgmq.create failed for queue "${queueName}": ${error.message}`);
    }
  }

  async send<T>(queueName: string, body: T, delaySecs = 0): Promise<string> {
    const { data, error } = await this.supabase.rpc('pgmq_send', {
      queue_name: queueName,
      msg: body,
      sleep_seconds: delaySecs,
    });

    if (error) {
      throw new Error(`pgmq.send failed for queue "${queueName}": ${error.message}`);
    }

    return String(data as number);
  }

  async sendBatch<T>(queueName: string, bodies: T[], delaySecs = 0): Promise<string[]> {
    const { data, error } = await this.supabase.rpc('pgmq_send_batch', {
      queue_name: queueName,
      msgs: bodies,
      sleep_seconds: delaySecs,
    });

    if (error) {
      throw new Error(`pgmq.send_batch failed for queue "${queueName}": ${error.message}`);
    }

    return (data as number[]).map(String);
  }

  async read<T>(queueName: string, vtSeconds: number, qty: number): Promise<PgmqMessage<T>[]> {
    const { data, error } = await this.supabase.rpc('pgmq_read', {
      queue_name: queueName,
      vt: vtSeconds,
      qty,
    });

    if (error) {
      throw new Error(`pgmq.read failed for queue "${queueName}": ${error.message}`);
    }

    if (!data || !Array.isArray(data)) return [];

    return (data as PgmqMessageRecord[]).map((row) => ({
      msgId: String(row.msg_id),
      readCount: row.read_ct,
      enqueuedAt: row.enqueued_at,
      visibleAt: row.vt,
      body: row.message as T,
    }));
  }

  async delete(queueName: string, msgId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('pgmq_delete', {
      queue_name: queueName,
      msg_id: Number(msgId),
    });

    if (error) {
      throw new Error(`pgmq.delete failed for queue "${queueName}" msg ${msgId}: ${error.message}`);
    }

    return Boolean(data);
  }

  async archive(queueName: string, msgId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('pgmq_archive', {
      queue_name: queueName,
      msg_id: Number(msgId),
    });

    if (error) {
      throw new Error(
        `pgmq.archive failed for queue "${queueName}" msg ${msgId}: ${error.message}`,
      );
    }

    return Boolean(data);
  }

  async archiveBatch(queueName: string, msgIds: string[]): Promise<boolean[]> {
    const { data, error } = await this.supabase.rpc('pgmq_archive', {
      queue_name: queueName,
      msg_ids: msgIds.map(Number),
    });

    if (error) {
      throw new Error(`pgmq.archive (batch) failed for queue "${queueName}": ${error.message}`);
    }

    return (data as boolean[]) ?? [];
  }
}
