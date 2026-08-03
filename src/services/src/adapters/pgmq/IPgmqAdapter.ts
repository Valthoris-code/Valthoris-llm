/**
 * adapters/pgmq/IPgmqAdapter.ts
 *
 * Interface for a pgmq (PostgreSQL Message Queue) adapter.
 * Implementations communicate with the pgmq extension installed in Supabase.
 *
 * pgmq reference: https://github.com/tembo-io/pgmq
 */

export interface PgmqMessage<T = unknown> {
  /** Unique message ID (bigint in pgmq, represented as string to avoid precision issues) */
  msgId: string;
  /** Number of times this message has been read */
  readCount: number;
  /** ISO-8601 timestamp when the message was enqueued */
  enqueuedAt: string;
  /** ISO-8601 timestamp until which the message is invisible to other consumers */
  visibleAt: string;
  /** The actual message body */
  body: T;
}

/**
 * Provider-agnostic interface for queue operations.
 * All implementations must be idempotent and handle transient failures gracefully.
 */
export interface IPgmqAdapter {
  /**
   * Ensure the queue exists; safe to call multiple times (idempotent).
   * Creates the queue if it does not already exist.
   */
  ensureQueue(queueName: string): Promise<void>;

  /**
   * Enqueue a single message.
   * @param queueName  Name of the target queue
   * @param body       Serialisable message payload
   * @param delaySecs  Optional delivery delay in seconds (default: 0)
   * @returns The message ID assigned by pgmq
   */
  send<T>(queueName: string, body: T, delaySecs?: number): Promise<string>;

  /**
   * Enqueue multiple messages atomically.
   * @returns Array of message IDs in the same order as the input
   */
  sendBatch<T>(queueName: string, bodies: T[], delaySecs?: number): Promise<string[]>;

  /**
   * Read up to `qty` messages, making them invisible for `vtSeconds`.
   * The caller is responsible for deleting or archiving each message once
   * it has been successfully processed.
   */
  read<T>(queueName: string, vtSeconds: number, qty: number): Promise<PgmqMessage<T>[]>;

  /**
   * Permanently delete a message from the queue.
   * Use this when the message was processed successfully and you do not
   * need to retain it for auditing.
   */
  delete(queueName: string, msgId: string): Promise<boolean>;

  /**
   * Archive a message (move it to the pgmq archive table).
   * Use this instead of delete when you want to keep a history of
   * processed messages.
   */
  archive(queueName: string, msgId: string): Promise<boolean>;

  /**
   * Archive multiple messages in a single call.
   */
  archiveBatch(queueName: string, msgIds: string[]): Promise<boolean[]>;
}
