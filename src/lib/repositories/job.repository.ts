import { getDbPool } from '../db';

export interface ScheduledJob {
  id: string;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  target_id: string | null;
  payload: Record<string, unknown>;
  run_at: string;
  locked_at: string | null;
  locked_by: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateJobInput {
  id?: string;
  job_type: string;
  target_id?: string | null;
  payload?: Record<string, unknown>;
  run_at?: Date;
  max_attempts?: number;
}

export class JobRepository {
  async createJob(input: CreateJobInput): Promise<ScheduledJob> {
    const pool = getDbPool();
    const id = input.id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const runAt = input.run_at || new Date();
    const payload = JSON.stringify(input.payload || {});

    const query = `
      INSERT INTO scheduled_jobs (
        id, job_type, status, target_id, payload, run_at, max_attempts
      ) VALUES ($1, $2, 'pending', $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        job_type = EXCLUDED.job_type,
        payload = EXCLUDED.payload,
        run_at = EXCLUDED.run_at,
        updated_at = NOW()
      RETURNING *;
    `;

    const res = await pool.query(query, [
      id,
      input.job_type,
      input.target_id || null,
      payload,
      runAt.toISOString(),
      input.max_attempts || 5,
    ]);

    return res.rows[0];
  }

  /**
   * Concurrency-safe job claiming using FOR UPDATE SKIP LOCKED inside transaction
   */
  async claimNextJob(workerId: string, supportedTypes?: string[]): Promise<ScheduledJob | null> {
    const { withTransaction } = await import('../db');

    return await withTransaction(async (client) => {
      let typeClause = '';
      const selectParams: unknown[] = [];

      if (supportedTypes && supportedTypes.length > 0) {
        typeClause = `AND job_type = ANY($1::text[])`;
        selectParams.push(supportedTypes);
      }

      // Concurrency-safe select: FOR UPDATE SKIP LOCKED on real PostgreSQL, FOR UPDATE on in-memory emulator
      const lockClause = process.env.DATABASE_URL ? 'FOR UPDATE SKIP LOCKED' : 'FOR UPDATE';
      const candidateRes = await client.query(
        `
        SELECT id FROM scheduled_jobs
        WHERE status = 'pending'
          AND run_at <= NOW()
          AND attempts < max_attempts
          ${typeClause}
        ORDER BY run_at ASC, attempts ASC
        LIMIT 1
        ${lockClause};
        `,
        selectParams
      );

      if (!candidateRes.rows[0]) {
        return null;
      }

      const candidateId = candidateRes.rows[0].id;

      // 2. Lock & claim the candidate job
      const updateRes = await client.query(
        `
        UPDATE scheduled_jobs
        SET status = 'running',
            locked_at = NOW(),
            locked_by = $1,
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *;
        `,
        [workerId, candidateId]
      );

      return updateRes.rows[0] || null;
    });
  }

  async completeJob(id: string): Promise<boolean> {
    const pool = getDbPool();
    const res = await pool.query(
      `
      UPDATE scheduled_jobs
      SET status = 'completed',
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id;
      `,
      [id]
    );
    return (res.rowCount || 0) > 0;
  }

  async failJob(id: string, error: string, retryDelaySeconds?: number): Promise<ScheduledJob | null> {
    const pool = getDbPool();

    // Check attempts vs max_attempts
    const getRes = await pool.query('SELECT attempts, max_attempts FROM scheduled_jobs WHERE id = $1', [id]);
    if (!getRes.rows[0]) return null;

    const { attempts, max_attempts } = getRes.rows[0];
    const willRetry = attempts < max_attempts && (retryDelaySeconds !== undefined ? retryDelaySeconds > 0 : true);
    const nextStatus = willRetry ? 'pending' : 'failed';
    const nextRunAt = willRetry
      ? new Date(Date.now() + (retryDelaySeconds || Math.min(3600, 30 * Math.pow(2, attempts - 1))) * 1000)
      : new Date();

    const updateRes = await pool.query(
      `
      UPDATE scheduled_jobs
      SET status = $2,
          last_error = $3,
          locked_at = NULL,
          locked_by = NULL,
          run_at = $4,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
      `,
      [id, nextStatus, error, nextRunAt.toISOString()]
    );

    return updateRes.rows[0] || null;
  }

  async releaseJob(id: string): Promise<boolean> {
    const pool = getDbPool();
    const res = await pool.query(
      `
      UPDATE scheduled_jobs
      SET status = 'pending',
          locked_at = NULL,
          locked_by = NULL,
          updated_at = NOW()
      WHERE id = $1;
      `,
      [id]
    );
    return (res.rowCount || 0) > 0;
  }

  async getJobById(id: string): Promise<ScheduledJob | null> {
    const pool = getDbPool();
    const res = await pool.query('SELECT * FROM scheduled_jobs WHERE id = $1', [id]);
    return res.rows[0] || null;
  }

  async listJobs(options?: { status?: string; limit?: number; offset?: number }): Promise<ScheduledJob[]> {
    const pool = getDbPool();
    const values: unknown[] = [];
    const conditions: string[] = [];

    if (options?.status) {
      conditions.push(`status = $${values.length + 1}`);
      values.push(options.status);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(100, Math.max(1, options?.limit || 50));
    const offset = Math.max(0, options?.offset || 0);

    values.push(limit, offset);
    const query = `
      SELECT * FROM scheduled_jobs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length};
    `;

    const res = await pool.query(query, values);
    return res.rows;
  }
}

export const jobRepo = new JobRepository();
