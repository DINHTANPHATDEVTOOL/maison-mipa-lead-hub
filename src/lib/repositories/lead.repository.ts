import { CRMLead, CRMStage } from '@/types';
import { getDbPool } from '../db';

export class LeadRepository {
  private static instance: LeadRepository;

  public static getInstance(): LeadRepository {
    if (!LeadRepository.instance) {
      LeadRepository.instance = new LeadRepository();
    }
    return LeadRepository.instance;
  }

  public async getAll(filter?: { stage?: string }): Promise<CRMLead[]> {
    const pool = getDbPool();
    const query = filter?.stage
      ? `SELECT id, post_id, customer_name, customer_facebook_url, service_interest, stage, assigned_cskh_name, booking_date, quoted_amount, notes, post_summary, version, created_at, updated_at
         FROM crm_leads
         WHERE stage = $1
         ORDER BY updated_at DESC`
      : `SELECT id, post_id, customer_name, customer_facebook_url, service_interest, stage, assigned_cskh_name, booking_date, quoted_amount, notes, post_summary, version, created_at, updated_at
         FROM crm_leads
         ORDER BY updated_at DESC`;
    const params = filter?.stage ? [filter.stage] : [];
    const res = await pool.query(query, params);
    return res.rows.map(this.mapRow);
  }

  public async getById(id: string): Promise<CRMLead | null> {
    const pool = getDbPool();
    const res = await pool.query('SELECT * FROM crm_leads WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async getByPostId(postId: string): Promise<CRMLead | null> {
    const pool = getDbPool();
    const res = await pool.query('SELECT * FROM crm_leads WHERE post_id = $1', [postId]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async create(data: {
    id?: string;
    post_id?: string;
    customer_name: string;
    customer_facebook_url?: string;
    service_interest?: string;
    stage?: CRMStage;
    assigned_cskh_name?: string;
    booking_date?: string | null;
    quoted_amount?: number | null;
    notes?: string;
    post_summary?: string;
  }): Promise<CRMLead> {
    const pool = getDbPool();
    const leadId = data.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let finalPostId = data.post_id;
    if (!finalPostId) {
      finalPostId = `post_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await pool.query(`
        INSERT INTO facebook_posts (id, post_url, post_url_hash, content_raw, author_name, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT DO NOTHING
      `, [finalPostId, data.customer_facebook_url || `https://facebook.com/${finalPostId}`, finalPostId, 'Lead created without initial post', data.customer_name || 'Khách Hàng Facebook']).catch(() => {});
    }

    const res = await pool.query(`
      INSERT INTO crm_leads (
        id,
        post_id, customer_name, customer_facebook_url, service_interest, stage, assigned_cskh_name, booking_date, quoted_amount, notes, post_summary, version, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1, NOW(), NOW()
      )
      RETURNING *
    `, [
      leadId,
      finalPostId,
      data.customer_name || 'Khách Hàng Facebook',
      data.customer_facebook_url || '',
      data.service_interest || 'Tư Vấn Chụp Ảnh',
      data.stage || 'uncontacted',
      data.assigned_cskh_name || 'CSKH Team',
      data.booking_date || null,
      data.quoted_amount ?? null,
      data.notes || '',
      data.post_summary || '',
    ]);

    return this.mapRow(res.rows[0]);
  }

  /**
   * Update lead with Optimistic Concurrency Control (OCC).
   * Throws Error with status 409 if version conflict detected.
   */
  public async update(
    id: string,
    updates: Partial<CRMLead>,
    expectedVersion?: number
  ): Promise<CRMLead | null> {
    const pool = getDbPool();
    const current = await this.getById(id);
    if (!current) return null;

    if (expectedVersion !== undefined && (current as any).version !== expectedVersion) {
      const err: any = new Error(
        `[OCC Conflict] Dữ liệu Lead đã bị sửa đổi bởi nhân viên khác (Phiên bản: ${(current as any).version}, Bạn gửi: ${expectedVersion}). Vui lòng tải lại trang.`
      );
      err.status = 409;
      err.code = 'ERR_CONCURRENT_MODIFICATION';
      throw err;
    }

    const fields: string[] = ['version = version + 1', 'updated_at = NOW()'];
    const values: any[] = [];
    let idx = 1;

    if (updates.customer_name !== undefined) {
      fields.push(`customer_name = $${idx++}`);
      values.push(updates.customer_name.trim());
    }
    if (updates.customer_facebook_url !== undefined) {
      fields.push(`customer_facebook_url = $${idx++}`);
      values.push(updates.customer_facebook_url.trim());
    }
    if (updates.service_interest !== undefined) {
      fields.push(`service_interest = $${idx++}`);
      values.push(updates.service_interest);
    }
    if (updates.stage !== undefined) {
      fields.push(`stage = $${idx++}`);
      values.push(updates.stage);
    }
    if (updates.assigned_cskh_name !== undefined) {
      fields.push(`assigned_cskh_name = $${idx++}`);
      values.push(updates.assigned_cskh_name.trim());
    }
    if (updates.booking_date !== undefined) {
      fields.push(`booking_date = $${idx++}`);
      values.push(updates.booking_date);
    }
    if (updates.quoted_amount !== undefined) {
      fields.push(`quoted_amount = $${idx++}`);
      values.push(updates.quoted_amount);
    }
    if (updates.notes !== undefined) {
      fields.push(`notes = $${idx++}`);
      values.push(updates.notes);
    }
    if (updates.post_summary !== undefined) {
      fields.push(`post_summary = $${idx++}`);
      values.push(updates.post_summary);
    }

    values.push(id);
    let whereClause = `WHERE id = $${idx}`;

    if (expectedVersion !== undefined) {
      idx++;
      values.push(expectedVersion);
      whereClause += ` AND version = $${idx}`;
    }

    const res = await pool.query(`
      UPDATE crm_leads
      SET ${fields.join(', ')}
      ${whereClause}
      RETURNING *
    `, values);

    if (res.rows.length === 0) {
      const err: any = new Error(
        `[OCC Conflict] Dữ liệu Lead bị thay đổi đồng thời. Thao tác ghi bị hủy để chống ghi đè.`
      );
      err.status = 409;
      err.code = 'ERR_CONCURRENT_MODIFICATION';
      throw err;
    }

    return this.mapRow(res.rows[0]);
  }

  public async updateWithOcc(
    id: string,
    version: number,
    updates: Partial<CRMLead>
  ): Promise<{ success: boolean; lead?: CRMLead; current?: CRMLead; error?: string }> {
    try {
      const lead = await this.update(id, updates, version);
      if (!lead) return { success: false, error: 'Không tìm thấy hồ sơ khách hàng' };
      return { success: true, lead };
    } catch (e: any) {
      if (e.status === 409) {
        const current = await this.getById(id);
        return { success: false, current: current || undefined, error: e.message };
      }
      throw e;
    }
  }

  private mapRow(row: any): CRMLead {
    return {
      id: row.id,
      post_id: row.post_id,
      customer_name: row.customer_name,
      customer_facebook_url: row.customer_facebook_url,
      service_interest: row.service_interest,
      stage: row.stage,
      assigned_cskh_name: row.assigned_cskh_name,
      booking_date: row.booking_date ? new Date(row.booking_date).toISOString() : null,
      quoted_amount: row.quoted_amount !== null ? Number(row.quoted_amount) : null,
      notes: row.notes || '',
      post_summary: row.post_summary || '',
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
      ...(row.version !== undefined ? { version: Number(row.version) } : {}),
    } as any;
  }
}

export const leadRepo = LeadRepository.getInstance();
