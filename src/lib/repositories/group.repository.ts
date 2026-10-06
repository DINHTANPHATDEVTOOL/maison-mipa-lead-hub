import { FacebookGroup, GroupCheckStatus } from '@/types';
import { getDbPool } from '../db';

export class GroupRepository {
  private static instance: GroupRepository;

  public static getInstance(): GroupRepository {
    if (!GroupRepository.instance) {
      GroupRepository.instance = new GroupRepository();
    }
    return GroupRepository.instance;
  }

  public async getAll(): Promise<FacebookGroup[]> {
    const pool = getDbPool();
    const res = await pool.query(`
      SELECT 
        id, 
        name, 
        url, 
        check_interval_seconds, 
        lookback_hours, 
        status, 
        last_checked_at, 
        next_check_at, 
        total_posts_found, 
        last_error_message, 
        can_page_comment, 
        created_at
      FROM facebook_groups
      ORDER BY created_at DESC
    `);
    return res.rows.map(this.mapRow);
  }

  public async getById(id: string): Promise<FacebookGroup | null> {
    const pool = getDbPool();
    const res = await pool.query(`
      SELECT * FROM facebook_groups WHERE id = $1
    `, [id]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async getByUrl(url: string): Promise<FacebookGroup | null> {
    const pool = getDbPool();
    const res = await pool.query(`
      SELECT * FROM facebook_groups WHERE url = $1
    `, [url.trim()]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async create(data: {
    id?: string;
    name: string;
    url: string;
    check_interval_seconds?: number;
    lookback_hours?: number;
    status?: GroupCheckStatus;
    can_page_comment?: boolean;
  }): Promise<FacebookGroup> {
    const pool = getDbPool();
    const res = await pool.query(`
      INSERT INTO facebook_groups (
        ${data.id ? 'id,' : ''}
        name,
        url,
        check_interval_seconds,
        lookback_hours,
        status,
        can_page_comment,
        next_check_at,
        created_at,
        updated_at
      ) VALUES (
        ${data.id ? '$1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW()' : '$1, $2, $3, $4, $5, $6, NOW(), NOW(), NOW()'}
      )
      RETURNING *
    `, data.id ? [
      data.id,
      data.name.trim(),
      data.url.trim(),
      data.check_interval_seconds ?? 150,
      data.lookback_hours ?? 24,
      data.status ?? 'active',
      data.can_page_comment ?? true,
    ] : [
      data.name.trim(),
      data.url.trim(),
      data.check_interval_seconds ?? 150,
      data.lookback_hours ?? 24,
      data.status ?? 'active',
      data.can_page_comment ?? true,
    ]);

    return this.mapRow(res.rows[0]);
  }

  public async update(id: string, updates: Partial<FacebookGroup>): Promise<FacebookGroup | null> {
    const pool = getDbPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name.trim());
    }
    if (updates.url !== undefined) {
      fields.push(`url = $${idx++}`);
      values.push(updates.url.trim());
    }
    if (updates.check_interval_seconds !== undefined) {
      fields.push(`check_interval_seconds = $${idx++}`);
      values.push(updates.check_interval_seconds);
    }
    if (updates.lookback_hours !== undefined) {
      fields.push(`lookback_hours = $${idx++}`);
      values.push(updates.lookback_hours);
    }
    if (updates.status !== undefined) {
      fields.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.last_checked_at !== undefined) {
      fields.push(`last_checked_at = $${idx++}`);
      values.push(updates.last_checked_at);
    }
    if (updates.next_check_at !== undefined) {
      fields.push(`next_check_at = $${idx++}`);
      values.push(updates.next_check_at);
    }
    if (updates.total_posts_found !== undefined) {
      fields.push(`total_posts_found = $${idx++}`);
      values.push(updates.total_posts_found);
    }
    if (updates.last_error_message !== undefined) {
      fields.push(`last_error_message = $${idx++}`);
      values.push(updates.last_error_message);
    }
    if (updates.can_page_comment !== undefined) {
      fields.push(`can_page_comment = $${idx++}`);
      values.push(updates.can_page_comment);
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const res = await pool.query(`
      UPDATE facebook_groups
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, values);

    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async updateCheckTimestamps(id: string, lastCheckedAt: string, nextCheckAt: string): Promise<FacebookGroup | null> {
    return this.update(id, { last_checked_at: lastCheckedAt, next_check_at: nextCheckAt });
  }

  public async updateStatus(id: string, status: import('@/types').GroupCheckStatus, lastErrorMessage?: string | null): Promise<FacebookGroup | null> {
    return this.update(id, { status, last_error_message: lastErrorMessage });
  }

  public async delete(id: string): Promise<boolean> {
    const pool = getDbPool();
    const res = await pool.query('DELETE FROM facebook_groups WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  private mapRow(row: any): FacebookGroup {
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      check_interval_seconds: row.check_interval_seconds,
      lookback_hours: row.lookback_hours,
      status: row.status,
      last_checked_at: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : null,
      next_check_at: row.next_check_at ? new Date(row.next_check_at).toISOString() : null,
      total_posts_found: row.total_posts_found,
      last_error_message: row.last_error_message,
      can_page_comment: Boolean(row.can_page_comment),
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  }
}

export const groupRepo = GroupRepository.getInstance();
