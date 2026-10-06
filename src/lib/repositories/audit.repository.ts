import { getDbPool } from '../db';

export interface AuditEvent {
  id: string;
  actor_type: 'user' | 'system' | 'worker';
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes?: Record<string, unknown> | null;
  created_at: string;
}

export interface RecordEventInput {
  actor_type: 'user' | 'system' | 'worker';
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  changes?: Record<string, unknown> | null;
}

export class AuditRepository {
  async recordEvent(input: RecordEventInput): Promise<AuditEvent> {
    const pool = getDbPool();
    const id = `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const changes = input.changes ? JSON.stringify(input.changes) : null;

    const query = `
      INSERT INTO audit_events (
        id, actor_type, actor_id, action, entity_type, entity_id, changes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      input.actor_type,
      input.actor_id,
      input.action,
      input.entity_type,
      input.entity_id,
      changes,
    ]);

    return res.rows[0];
  }

  async listEvents(options?: {
    entity_type?: string;
    entity_id?: string;
    actor_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]> {
    const pool = getDbPool();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (options?.entity_type) {
      conditions.push(`entity_type = $${values.length + 1}`);
      values.push(options.entity_type);
    }
    if (options?.entity_id) {
      conditions.push(`entity_id = $${values.length + 1}`);
      values.push(options.entity_id);
    }
    if (options?.actor_id) {
      conditions.push(`actor_id = $${values.length + 1}`);
      values.push(options.actor_id);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(100, Math.max(1, options?.limit || 50));
    const offset = Math.max(0, options?.offset || 0);

    values.push(limit, offset);
    const query = `
      SELECT * FROM audit_events
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length};
    `;

    const res = await pool.query(query, values);
    return res.rows;
  }
}

export const auditRepo = new AuditRepository();
