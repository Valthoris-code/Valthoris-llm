/**
 * services/audit/IAuditService.ts
 *
 * Interface for the audit logging service.
 * Every significant action taken by the backend services must be recorded
 * via this interface to support compliance, debugging, and incident response.
 */

export type AuditLevel = 'info' | 'warn' | 'error';

export interface AuditEntry {
  /** Service / component name, e.g. "FraudWorker", "IcpFraudIngestService" */
  actor: string;
  /** Dot-namespaced action, e.g. "fraud.decision.created", "queue.message.sent" */
  action: string;
  /** ID of the primary resource affected (optional) */
  resourceId?: string;
  /** Arbitrary structured metadata */
  metadata?: Record<string, unknown>;
  level?: AuditLevel;
}

export interface IAuditService {
  /**
   * Record an informational audit event.
   */
  log(entry: AuditEntry): Promise<void>;

  /**
   * Record a warning-level audit event.
   */
  warn(entry: Omit<AuditEntry, 'level'>): Promise<void>;

  /**
   * Record an error-level audit event.
   */
  error(entry: Omit<AuditEntry, 'level'>): Promise<void>;
}
