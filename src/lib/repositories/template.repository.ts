import { OutreachTemplate } from '@/types';
import { getDbPool } from '../db';

export class TemplateRepository {
  private static instance: TemplateRepository;

  public static getInstance(): TemplateRepository {
    if (!TemplateRepository.instance) {
      TemplateRepository.instance = new TemplateRepository();
    }
    return TemplateRepository.instance;
  }

  public async getAll(): Promise<OutreachTemplate[]> {
    const pool = getDbPool();
    const res = await pool.query(`
      SELECT id, service_id, title, template_content, allowed_placeholders, is_approved, version, updated_by_name, updated_at
      FROM outreach_templates
      ORDER BY created_at ASC
    `);
    return res.rows.map(this.mapRow);
  }

  public async getById(id: string): Promise<OutreachTemplate | null> {
    const pool = getDbPool();
    const res = await pool.query('SELECT * FROM outreach_templates WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async create(data: {
    id?: string;
    service_id?: string;
    title: string;
    template_content: string;
    allowed_placeholders?: string[];
    is_approved?: boolean;
    version?: number;
    updated_by_name?: string;
  }): Promise<OutreachTemplate> {
    const pool = getDbPool();
    const serviceId = data.service_id || 'srv-default';
    const res = await pool.query(`
      INSERT INTO outreach_templates (
        ${data.id ? 'id,' : ''}
        service_id, title, template_content, allowed_placeholders, is_approved, version, updated_by_name, created_at, updated_at
      ) VALUES (
        ${data.id ? '$1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()' : '$1, $2, $3, $4, $5, $6, $7, NOW(), NOW()'}
      )
      RETURNING *
    `, data.id ? [
      data.id,
      serviceId,
      data.title.trim(),
      data.template_content.trim(),
      JSON.stringify(data.allowed_placeholders || ['{gia}', '{khu_vuc}', '{ho_tro_tao_dang}', '{uu_dai}']),
      data.is_approved ?? true,
      data.version ?? 1,
      data.updated_by_name || 'Admin',
    ] : [
      serviceId,
      data.title.trim(),
      data.template_content.trim(),
      JSON.stringify(data.allowed_placeholders || ['{gia}', '{khu_vuc}', '{ho_tro_tao_dang}', '{uu_dai}']),
      data.is_approved ?? true,
      data.version ?? 1,
      data.updated_by_name || 'Admin',
    ]);

    return this.mapRow(res.rows[0]);
  }

  /**
   * Update template with Optimistic Concurrency Control (OCC).
   * If expectedVersion is specified, checks that database version matches,
   * then increments version. Throws Error with code 409 if version conflict detected.
   */
  public async update(
    id: string,
    updates: Partial<OutreachTemplate>,
    expectedVersion?: number
  ): Promise<OutreachTemplate | null> {
    const pool = getDbPool();
    const current = await this.getById(id);
    if (!current) return null;

    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      const err: any = new Error(
        `[OCC Conflict] Mẫu bình luận đã bị thay đổi bởi người dùng khác (Phiên bản hiện tại: ${current.version}, Phiên bản bạn gửi: ${expectedVersion}). Vui lòng tải lại trang.`
      );
      err.status = 409;
      err.code = 'ERR_CONCURRENT_MODIFICATION';
      throw err;
    }

    const fields: string[] = ['version = version + 1', 'updated_at = NOW()'];
    const values: any[] = [];
    let idx = 1;

    if (updates.title !== undefined) {
      fields.push(`title = $${idx++}`);
      values.push(updates.title.trim());
    }
    if (updates.template_content !== undefined) {
      fields.push(`template_content = $${idx++}`);
      values.push(updates.template_content.trim());
    }
    if (updates.service_id !== undefined) {
      fields.push(`service_id = $${idx++}`);
      values.push(updates.service_id);
    }
    if (updates.allowed_placeholders !== undefined) {
      fields.push(`allowed_placeholders = $${idx++}`);
      values.push(JSON.stringify(updates.allowed_placeholders));
    }
    if (updates.is_approved !== undefined) {
      fields.push(`is_approved = $${idx++}`);
      values.push(updates.is_approved);
    }
    if (updates.updated_by_name !== undefined) {
      fields.push(`updated_by_name = $${idx++}`);
      values.push(updates.updated_by_name);
    }

    values.push(id);
    let whereClause = `WHERE id = $${idx}`;

    if (expectedVersion !== undefined) {
      idx++;
      values.push(expectedVersion);
      whereClause += ` AND version = $${idx}`;
    }

    const res = await pool.query(`
      UPDATE outreach_templates
      SET ${fields.join(', ')}
      ${whereClause}
      RETURNING *
    `, values);

    if (res.rows.length === 0) {
      const err: any = new Error(
        `[OCC Conflict] Mẫu bình luận đã bị sửa đổi đồng thời. Thao tác ghi bị hủy để chống ghi đè.`
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
    updates: Partial<OutreachTemplate>
  ): Promise<{ success: boolean; template?: OutreachTemplate; current?: OutreachTemplate; error?: string }> {
    try {
      const template = await this.update(id, updates, version);
      if (!template) return { success: false, error: 'Không tìm thấy mẫu tiếp cận' };
      return { success: true, template };
    } catch (e: any) {
      if (e.status === 409) {
        const current = await this.getById(id);
        return { success: false, current: current || undefined, error: e.message };
      }
      throw e;
    }
  }

  private mapRow(row: any): OutreachTemplate {
    let placeholders: string[] = [];
    try {
      placeholders = typeof row.allowed_placeholders === 'string'
        ? JSON.parse(row.allowed_placeholders)
        : (row.allowed_placeholders || []);
    } catch {}

    return {
      id: row.id,
      service_id: row.service_id,
      title: row.title,
      template_content: row.template_content,
      allowed_placeholders: placeholders,
      is_approved: Boolean(row.is_approved),
      version: Number(row.version),
      updated_by_name: row.updated_by_name || 'Admin',
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    };
  }
}

export const templateRepo = TemplateRepository.getInstance();
