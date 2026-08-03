/**
 * adapters/realtime/IRealtimeEmitter.ts
 *
 * Provider-agnostic interface for real-time event broadcasting.
 * Implementations wrap Supabase Realtime or any WebSocket/SSE backend.
 */

export interface RealtimeEvent<T = unknown> {
  /** Channel to broadcast to (e.g. "fraud-alert:user-123") */
  channel: string;
  /** Arbitrary event name (e.g. "fraud.decision.created") */
  event: string;
  /** Event payload */
  payload: T;
}

export interface IRealtimeEmitter {
  /**
   * Broadcast an event to all subscribers on the specified channel.
   * This is a fire-and-forget operation; the caller should not rely on
   * delivery guarantees.
   */
  broadcast<T>(event: RealtimeEvent<T>): Promise<void>;

  /**
   * Broadcast multiple events efficiently (single round-trip where possible).
   */
  broadcastBatch<T>(events: RealtimeEvent<T>[]): Promise<void>;
}
