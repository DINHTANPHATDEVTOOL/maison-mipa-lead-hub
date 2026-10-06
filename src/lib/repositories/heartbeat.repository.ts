import { WorkerHeartbeat } from '@/types';
import { getDbPool } from '../db';

export class HeartbeatRepository {
  private static instance: HeartbeatRepository;

  public static getInstance(): HeartbeatRepository {
    if (!HeartbeatRepository.instance) {
      HeartbeatRepository.instance = new HeartbeatRepository();
    }
    return HeartbeatRepository.instance;
  }

  public async getHeartbeat(workerId: string = 'worker-ubuntu-central-01'): Promise<WorkerHeartbeat> {
    const pool = getDbPool();
    const res = await pool.query('SELECT * FROM system_heartbeats WHERE worker_id = $1', [workerId]);
    if (res.rows.length === 0) {
      return this.createDefaultHeartbeat(workerId);
    }
    return this.mapRow(res.rows[0]);
  }

  public async recordWorkerPing(
    workerId: string = 'worker-ubuntu-central-01',
    activeJobs: number = 0,
    isAlive: boolean = true
  ): Promise<WorkerHeartbeat> {
    const pool = getDbPool();
    const res = await pool.query(`
      INSERT INTO system_heartbeats (
        worker_id, worker_name, is_alive, active_jobs_count, last_ping, operating_mode
      ) VALUES (
        $1, 'MIPA Ubuntu Dispatcher Core', $2, $3, NOW(), 'manual_review'
      )
      ON CONFLICT (worker_id) DO UPDATE SET
        is_alive = EXCLUDED.is_alive,
        active_jobs_count = EXCLUDED.active_jobs_count,
        last_ping = NOW()
      RETURNING *
    `, [workerId, isAlive, activeJobs]);

    return this.mapRow(res.rows[0]);
  }

  public async recordPing(
    workerId: string = 'worker-ubuntu-central-01',
    activeJobs: number = 0
  ): Promise<WorkerHeartbeat> {
    return this.recordWorkerPing(workerId, activeJobs, true);
  }

  public async updateOperatingMode(
    mode: 'manual_review' | 'auto_dispatch',
    workerId: string = 'worker-ubuntu-central-01'
  ): Promise<WorkerHeartbeat> {
    const pool = getDbPool();
    const res = await pool.query(`
      INSERT INTO system_heartbeats (
        worker_id, worker_name, is_alive, operating_mode, last_ping
      ) VALUES (
        $1, 'MIPA Ubuntu Dispatcher Core', false, $2, NOW()
      )
      ON CONFLICT (worker_id) DO UPDATE SET
        operating_mode = $2
      RETURNING *
    `, [workerId, mode]);

    return this.mapRow(res.rows[0]);
  }

  public async updateHeartbeat(
    updates: Partial<WorkerHeartbeat>,
    workerId: string = 'worker-ubuntu-central-01'
  ): Promise<WorkerHeartbeat> {
    const pool = getDbPool();
    const current = await this.getHeartbeat(workerId);
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (updates.is_alive !== undefined) {
      fields.push(`is_alive = $${idx++}`);
      values.push(updates.is_alive);
    }
    if (updates.facebook_auth_valid !== undefined) {
      fields.push(`facebook_auth_valid = $${idx++}`);
      values.push(updates.facebook_auth_valid);
    }
    if (updates.page_permission_valid !== undefined) {
      fields.push(`page_permission_valid = $${idx++}`);
      values.push(updates.page_permission_valid);
    }
    if (updates.active_jobs_count !== undefined) {
      fields.push(`active_jobs_count = $${idx++}`);
      values.push(updates.active_jobs_count);
    }
    if (updates.last_ping !== undefined) {
      fields.push(`last_ping = $${idx++}`);
      values.push(updates.last_ping ? new Date(updates.last_ping) : null);
    }
    if (updates.operating_mode !== undefined) {
      fields.push(`operating_mode = $${idx++}`);
      values.push(updates.operating_mode);
    }

    if (fields.length === 0) return current;

    values.push(workerId);
    const res = await pool.query(`
      UPDATE system_heartbeats
      SET ${fields.join(', ')}
      WHERE worker_id = $${idx}
      RETURNING *
    `, values);

    return this.mapRow(res.rows[0]);
  }

  private async createDefaultHeartbeat(workerId: string): Promise<WorkerHeartbeat> {
    const pool = getDbPool();
    const res = await pool.query(`
      INSERT INTO system_heartbeats (
        worker_id, worker_name, is_alive, facebook_auth_valid, page_permission_valid,
        active_jobs_count, last_ping, operating_mode
      ) VALUES (
        $1, 'MIPA Ubuntu Dispatcher Core', false, false, false, 0, NOW(), 'manual_review'
      )
      ON CONFLICT (worker_id) DO UPDATE SET worker_name = EXCLUDED.worker_name
      RETURNING *
    `, [workerId]);
    return this.mapRow(res.rows[0]);
  }

  private mapRow(row: any): WorkerHeartbeat {
    return {
      worker_id: row.worker_id,
      worker_name: row.worker_name || 'MIPA Ubuntu Dispatcher Core',
      is_alive: Boolean(row.is_alive),
      facebook_auth_valid: Boolean(row.facebook_auth_valid),
      page_permission_valid: Boolean(row.page_permission_valid),
      active_jobs_count: Number(row.active_jobs_count || 0),
      last_ping: row.last_ping ? new Date(row.last_ping).toISOString() : null,
      operating_mode: row.operating_mode || 'manual_review',
    };
  }
}

export const heartbeatRepo = HeartbeatRepository.getInstance();
