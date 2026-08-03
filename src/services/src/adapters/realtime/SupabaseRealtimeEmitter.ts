/**
 * adapters/realtime/SupabaseRealtimeEmitter.ts
 *
 * Supabase Realtime implementation of IRealtimeEmitter.
 *
 * Uses the Supabase Broadcast feature to push events to all connected
 * frontend clients subscribed to a given channel.
 *
 * Channel naming convention (enforced by callers, not this class):
 *   fraud-alert:<userId>     — per-user fraud alerts
 *   fraud-alert:global       — organisation-wide fraud alerts
 *   scan:result:<scanId>     — scan result updates
 *
 * TODO: In your Supabase project, ensure RLS policies allow the service role
 *       to broadcast on these channels, or use BYPASS RLS.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { IRealtimeEmitter, RealtimeEvent } from './IRealtimeEmitter';

export class SupabaseRealtimeEmitter implements IRealtimeEmitter {
  constructor(private readonly supabase: SupabaseClient) {}

  async broadcast<T>(event: RealtimeEvent<T>): Promise<void> {
    const channel = this.supabase.channel(event.channel);

    // Subscribe (no-op if already subscribed) then broadcast
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel
            .send({
              type: 'broadcast',
              event: event.event,
              payload: event.payload as Record<string, unknown>,
            })
            .then(() => {
              // Unsubscribe after sending to avoid channel accumulation
              void this.supabase.removeChannel(channel);
              resolve();
            })
            .catch(reject);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void this.supabase.removeChannel(channel);
          reject(new Error(`Realtime channel "${event.channel}" error: ${status}`));
        }
      });
    });
  }

  async broadcastBatch<T>(events: RealtimeEvent<T>[]): Promise<void> {
    // Group events by channel to minimise the number of channel subscriptions
    const byChannel = new Map<string, RealtimeEvent<T>[]>();
    for (const evt of events) {
      const list = byChannel.get(evt.channel) ?? [];
      list.push(evt);
      byChannel.set(evt.channel, list);
    }

    await Promise.all(
      [...byChannel.entries()].map(([channelName, channelEvents]) =>
        this.broadcastToChannel(channelName, channelEvents),
      ),
    );
  }

  // ─── Private helpers ──────────────────────────────────────────────────

  private async broadcastToChannel<T>(
    channelName: string,
    events: RealtimeEvent<T>[],
  ): Promise<void> {
    const channel = this.supabase.channel(channelName);

    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const sends = events.map((evt) =>
            channel.send({
              type: 'broadcast',
              event: evt.event,
              payload: evt.payload as Record<string, unknown>,
            }),
          );

          Promise.all(sends)
            .then(() => {
              void this.supabase.removeChannel(channel);
              resolve();
            })
            .catch(reject);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          void this.supabase.removeChannel(channel);
          reject(new Error(`Realtime channel "${channelName}" error: ${status}`));
        }
      });
    });
  }
}
