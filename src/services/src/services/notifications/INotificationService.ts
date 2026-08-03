/**
 * services/notifications/INotificationService.ts
 *
 * Interface for the notification service.
 * Implementations may write to the `notifications` DB table, push via
 * Supabase Realtime, send email, or fan-out to external push providers.
 */

export type NotificationType = 'fraud_alert' | 'scan_complete' | 'system';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Arbitrary extra data attached to the notification */
  data?: Record<string, unknown>;
}

export interface INotificationService {
  /**
   * Send a notification to a single user.
   * Returns the created notification ID.
   */
  send(payload: NotificationPayload): Promise<string>;

  /**
   * Send the same notification to multiple users.
   * Returns an array of created notification IDs in the same order.
   */
  sendBatch(payloads: NotificationPayload[]): Promise<string[]>;
}
