/**
 * services/audit/SupabaseAuditService.ts
 *
 * Supabase implementation of IAuditService.
 * Writes audit entries to the `audit_logs` table.
 *
 * TODO: Ensure the `audit_logs` table exists in your Supabase schema.
 *       See src/services/src/types/database.ts for the expected schema.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { AuditEntry, AuditLevel, IAuditService } from './IAuditService';
import { AuditLogInsert } from '../../types/database';

export class SupabaseAuditService implements IAuditService {
  constructor(
    private readonly supabase: SupabaseClient,
    /** Fallback console logging when the DB write fails */
    private readonly consoleOnError = true,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    await this.write({ ...entry, level: entry.level ?? 'info' });
  }

  async warn(entry: Omit<AuditEntry, 'level'>): Promise<void> {
    await this.write({ ...entry, level: 'warn' });
  }

  async error(entry: Omit<AuditEntry, 'level'>): Promise<void> {
    await this.write({ ...entry, level: 'error' });
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private async write(entry: AuditEntry & { level: AuditLevel }): Promise<void> {
    const row: AuditLogInsert = {
      actor: entry.actor,
      action: entry.action,
      resource_id: entry.resourceId ?? null,
      metadata: entry.metadata ?? {},
      level: entry.level,
    };

    const { error } = await this.supabase.from('audit_logs').insert(row);

    if (error) {
      // Never let audit failures crash the caller
      if (this.consoleOnError) {
        console.error('[AuditService] Failed to write audit log:', error.message, row);
      }
    }
  }
}
