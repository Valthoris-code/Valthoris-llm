/**
 * services/notifications/SupabaseNotificationService.ts
 *
 * Supabase implementation of INotificationService.
 *
 * Writes notifications to the `notifications` table and simultaneously
 * broadcasts a real-time event so connected frontend clients receive
 * an immediate push notification without polling.
 *
 * TODO: Ensure the `notifications` table exists in your Supabase schema.
 *       See src/services/src/types/database.ts for the expected schema.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { INotificationService, NotificationPayload } from './INotificationService';
import { IRealtimeEmitter } from '../../adapters/realtime/IRealtimeEmitter';
import { NotificationInsert } from '../../types/database';
import { NotificationConfig } from '../../config';

export class SupabaseNotificationService implements INotificationService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly realtime: IRealtimeEmitter,
    private readonly config: NotificationConfig,
  ) {}

  async send(payload: NotificationPayload): Promise<string> {
    const id = await this.persist(payload);
    await this.broadcastRealtime(id, payload);
    return id;
  }

  async sendBatch(payloads: NotificationPayload[]): Promise<string[]> {
    const ids = await this.persistBatch(payloads);
    await Promise.all(
      payloads.map((p, i) => this.broadcastRealtime(ids[i]!, p)),
    );
    return ids;
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private async persist(payload: NotificationPayload): Promise<string> {
    const row: NotificationInsert = {
      user_id: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? null,
    };

    const { data, error } = await this.supabase
      .from('notifications')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to persist notification: ${error.message}`);
    }

    return (data as { id: string }).id;
  }

  private async persistBatch(payloads: NotificationPayload[]): Promise<string[]> {
    const rows: NotificationInsert[] = payloads.map((p) => ({
      user_id: p.userId,
      type: p.type,
      title: p.title,
      body: p.body,
      data: p.data ?? null,
    }));

    const { data, error } = await this.supabase
      .from('notifications')
      .insert(rows)
      .select('id');

    if (error) {
      throw new Error(`Failed to persist notification batch: ${error.message}`);
    }

    return (data as Array<{ id: string }>).map((r) => r.id);
  }

  private async broadcastRealtime(
    notificationId: string,
    payload: NotificationPayload,
  ): Promise<void> {
    const channel = `${this.config.fraudAlertChannelPrefix}:${payload.userId}`;

    try {
      await this.realtime.broadcast({
        channel,
        event: `notification.${payload.type}`,
        payload: {
          notificationId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          data: payload.data ?? null,
        },
      });
    } catch (err) {
      // Real-time delivery is best-effort; never fail the whole operation
      console.warn(
        `[NotificationService] Realtime broadcast failed for user ${payload.userId}:`,
        err,
      );
    }
  }
}
