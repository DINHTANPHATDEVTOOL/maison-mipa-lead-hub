import { OutreachTemplate } from '@/types';
import { getDbPool } from '../db';
import { store } from '../store';

export class TemplateRepository {
  private static instance: TemplateRepository;

  public static getInstance(): TemplateRepository {
    if (!TemplateRepository.instance) {
      TemplateRepository.instance = new TemplateRepository();
    }
    return TemplateRepository.instance;
  }

  public async getAll(): Promise<OutreachTemplate[]> {
    try {
      const pool = getDbPool();
      const res = await pool.query(`
        SELECT id, service_id, title, template_content, allowed_placeholders, is_approved, version, updated_by_name, updated_at
        FROM outreach_templates
        ORDER BY created_at ASC
      `);
      if (res.rows.length > 0) {
        return res.rows.map(this.mapRow);
      }
    } catch {}

    return store.getTemplates();
  }

  public async getById(id: string): Promise<OutreachTemplate | null> {
    try {
      const pool = getDbPool();
      const res = await pool.query('SELECT * FROM outreach_templates WHERE id = $1', [id]);
      if (res.rows.length > 0) return this.mapRow(res.rows[0]);
    } catch {}

    return store.getTemplates().find(t => t.id === id) || null;
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
    const id = data.id || ('tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9));
    const serviceId = data.service_id || 'srv-01';
    let dbCreated: OutreachTemplate | null = null;

    try {
      const pool = getDbPool();

      // Ensure service exists in services table first to avoid foreign key violation
      try {
        const srvCheck = await pool.query('SELECT id FROM services WHERE id = $1', [serviceId]);
        if (srvCheck.rows.length === 0) {
          const fallbackSrv = store.getServices().find(s => s.id === serviceId) || {
            id: serviceId,
            code: 'SERVICE_' + serviceId,
            name: 'Gói chụp ' + serviceId,
            base_price: 1000000,
            price_note: '',
            service_area: 'TP. Hồ Chí Minh',
            includes_posing_support: true,
            is_active: true,
          };
          await pool.query(`
            INSERT INTO services (id, code, name, base_price, price_note, service_area, includes_posing_support, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
            ON CONFLICT (id) DO NOTHING
          `, [
            fallbackSrv.id, fallbackSrv.code, fallbackSrv.name, fallbackSrv.base_price, fallbackSrv.price_note, fallbackSrv.service_area, fallbackSrv.includes_posing_support, fallbackSrv.is_active
          ]);
        }
      } catch {}

      const res = await pool.query(`
        INSERT INTO outreach_templates (
          id,
          service_id, title, template_content, allowed_placeholders, is_approved, version, updated_by_name, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
        )
        RETURNING *
      `, [
        id,
        serviceId,
        data.title.trim(),
        data.template_content.trim(),
        JSON.stringify(data.allowed_placeholders || ['{gia}', '{khu_vuc}', '{ho_tro_tao_dang}', '{uu_dai}']),
        data.is_approved ?? true,
        data.version ?? 1,
        data.updated_by_name || 'Admin',
      ]);

      if (res.rows.length > 0) {
        dbCreated = this.mapRow(res.rows[0]);
      }
    } catch {}

    const storeCreated = store.addTemplate({
      id,
      service_id: serviceId,
      title: data.title.trim(),
      template_content: data.template_content.trim(),
      allowed_placeholders: data.allowed_placeholders || ['{gia}', '{khu_vuc}', '{ho_tro_tao_dang}', '{uu_dai}'],
      is_approved: data.is_approved ?? true,
      updated_by_name: data.updated_by_name || 'Admin',
    });

    return dbCreated || storeCreated;
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

    let dbUpdated: OutreachTemplate | null = null;
    try {
      const pool = getDbPool();

      // Ensure template exists in PostgreSQL table
      const existsInDb = await pool.query('SELECT id FROM outreach_templates WHERE id = $1', [id]);
      if (existsInDb.rows.length === 0) {
        const srvId = updates.service_id || current.service_id || 'srv-01';
        try {
          const srvExists = await pool.query('SELECT id FROM services WHERE id = $1', [srvId]);
          if (srvExists.rows.length === 0) {
            const fallbackSrv = store.getServices().find(s => s.id === srvId) || {
              id: srvId,
              code: 'SERVICE_' + srvId,
              name: 'Gói chụp ' + srvId,
              base_price: 1000000,
              price_note: '',
              service_area: 'TP. Hồ Chí Minh',
              includes_posing_support: true,
              is_active: true,
            };
            await pool.query(`
              INSERT INTO services (id, code, name, base_price, price_note, service_area, includes_posing_support, is_active, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
              ON CONFLICT (id) DO NOTHING
            `, [
              fallbackSrv.id, fallbackSrv.code, fallbackSrv.name, fallbackSrv.base_price, fallbackSrv.price_note, fallbackSrv.service_area, fallbackSrv.includes_posing_support, fallbackSrv.is_active
            ]);
          }
        } catch {}

        await pool.query(`
          INSERT INTO outreach_templates (
            id, service_id, title, template_content, allowed_placeholders, is_approved, version, updated_by_name, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
          )
          ON CONFLICT (id) DO NOTHING
        `, [
          current.id,
          srvId,
          current.title,
          current.template_content,
          JSON.stringify(current.allowed_placeholders || []),
          current.is_approved,
          current.version,
          current.updated_by_name || 'Admin',
        ]);
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

      if (res.rows.length > 0) {
        dbUpdated = this.mapRow(res.rows[0]);
      } else if (expectedVersion !== undefined) {
        const err: any = new Error(
          `[OCC Conflict] Mẫu bình luận đã bị sửa đổi đồng thời. Thao tác ghi bị hủy để chống ghi đè.`
        );
        err.status = 409;
        err.code = 'ERR_CONCURRENT_MODIFICATION';
        throw err;
      }
    } catch (e: any) {
      if (e.status === 409) throw e;
    }

    // Always keep store in sync!
    const storeUpdated = store.updateTemplate(id, {
      ...updates,
      version: (current.version || 1) + 1,
      updated_at: new Date().toISOString(),
    });

    return dbUpdated || storeUpdated || null;
  }

  public async updateWithOcc(
    id: string,
    version: number,
    updates: Partial<OutreachTemplate>
  ): Promise<{ success: boolean; template?: OutreachTemplate; current?: OutreachTemplate; error?: string }> {
    try {
      const template = await this.update(id, updates, version);
      if (!template) {
        const fallback = store.updateTemplate(id, updates);
        if (fallback) return { success: true, template: fallback };
        return { success: false, error: 'Không tìm thấy mẫu tiếp cận' };
      }
      return { success: true, template };
    } catch (e: any) {
      if (e.status === 409) {
        const current = await this.getById(id);
        return { success: false, current: current || undefined, error: e.message };
      }
      throw e;
    }
  }

  public async delete(id: string): Promise<boolean> {
    try {
      const pool = getDbPool();
      await pool.query('DELETE FROM outreach_templates WHERE id = $1', [id]);
    } catch {}
    store.deleteTemplate(id);
    return true;
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
