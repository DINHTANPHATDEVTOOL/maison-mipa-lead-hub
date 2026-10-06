import { ServiceItem } from '@/types';
import { getDbPool } from '../db';

export class ServiceRepository {
  private static instance: ServiceRepository;

  public static getInstance(): ServiceRepository {
    if (!ServiceRepository.instance) {
      ServiceRepository.instance = new ServiceRepository();
    }
    return ServiceRepository.instance;
  }

  public async getAll(): Promise<ServiceItem[]> {
    const pool = getDbPool();
    const res = await pool.query(`
      SELECT id, code, name, base_price, price_note, service_area, includes_posing_support, is_active
      FROM services
      ORDER BY created_at ASC
    `);
    return res.rows.map(this.mapRow);
  }

  public async getById(id: string): Promise<ServiceItem | null> {
    const pool = getDbPool();
    const res = await pool.query('SELECT * FROM services WHERE id = $1', [id]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  public async create(data: {
    id?: string;
    code: string;
    name: string;
    base_price: number;
    price_note?: string;
    service_area?: string;
    includes_posing_support?: boolean;
    is_active?: boolean;
  }): Promise<ServiceItem> {
    const pool = getDbPool();
    const id = data.id || ('srv_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9));
    const res = await pool.query(`
      INSERT INTO services (
        id, code, name, base_price, price_note, service_area, includes_posing_support, is_active, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
      )
      RETURNING *
    `, [
      id,
      data.code.trim(),
      data.name.trim(),
      data.base_price,
      data.price_note || '',
      data.service_area || 'TP. Hồ Chí Minh',
      data.includes_posing_support ?? true,
      data.is_active ?? true,
    ]);

    return this.mapRow(res.rows[0]);
  }

  public async update(id: string, updates: Partial<ServiceItem>): Promise<ServiceItem | null> {
    const pool = getDbPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name.trim());
    }
    if (updates.base_price !== undefined) {
      fields.push(`base_price = $${idx++}`);
      values.push(updates.base_price);
    }
    if (updates.price_note !== undefined) {
      fields.push(`price_note = $${idx++}`);
      values.push(updates.price_note);
    }
    if (updates.service_area !== undefined) {
      fields.push(`service_area = $${idx++}`);
      values.push(updates.service_area);
    }
    if (updates.includes_posing_support !== undefined) {
      fields.push(`includes_posing_support = $${idx++}`);
      values.push(updates.includes_posing_support);
    }
    if (updates.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(updates.is_active);
    }

    if (fields.length === 0) return this.getById(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const res = await pool.query(`
      UPDATE services
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING *
    `, values);

    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  private mapRow(row: any): ServiceItem {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      base_price: Number(row.base_price),
      price_note: row.price_note || '',
      service_area: row.service_area || 'TP. Hồ Chí Minh',
      includes_posing_support: Boolean(row.includes_posing_support),
      is_active: Boolean(row.is_active),
    };
  }
}

export const serviceRepo = ServiceRepository.getInstance();
