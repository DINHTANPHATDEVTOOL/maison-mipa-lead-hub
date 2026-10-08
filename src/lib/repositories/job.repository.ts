import { getDbPool } from '../db';
import crypto from 'crypto';

export interface ScheduledJob {
  id: string;
  job_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  target_id: string | null;
  payload: Record<string, unknown>;
  run_at: string;
  locked_at: string | null;
  locked_by: string | null;
  claim_token?: string | null;
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
        payload = CASE 
          WHEN scheduled_jobs.status = 'running' THEN scheduled_jobs.payload
          ELSE EXCLUDED.payload
        END,
        run_at = CASE 
          WHEN scheduled_jobs.status IN ('completed', 'failed') THEN EXCLUDED.run_at
          ELSE scheduled_jobs.run_at
        END,
        status = CASE 
          WHEN scheduled_jobs.status IN ('completed', 'failed') THEN 'pending'
          ELSE scheduled_jobs.status
        END,
        attempts = CASE 
          WHEN scheduled_jobs.status IN ('completed', 'failed') THEN 0
          ELSE scheduled_jobs.attempts
        END,
        locked_at = CASE 
          WHEN scheduled_jobs.status IN ('completed', 'failed') THEN NULL
          ELSE scheduled_jobs.locked_at
        END,
        locked_by = CASE 
          WHEN scheduled_jobs.status IN ('completed', 'failed') THEN NULL
          ELSE scheduled_jobs.locked_by
        END,
        claim_token = CASE 
          WHEN scheduled_jobs.status IN ('completed', 'failed') THEN NULL
          ELSE scheduled_jobs.claim_token
        END,
        last_error = CASE 
          WHEN scheduled_jobs.status IN ('completed', 'failed') THEN NULL
          ELSE scheduled_jobs.last_error
        END,
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
   * Recovers jobs stuck in 'running' state after worker crash/kill (lease timeout)
   */
  async recoverStuckJobs(timeoutMinutes: number = 5): Promise<number> {
    const pool = getDbPool();
    const res = await pool.query(`
      UPDATE scheduled_jobs
      SET status = 'pending',
          locked_at = NULL,
          locked_by = NULL,
          claim_token = NULL,
          updated_at = NOW()
      WHERE status = 'running'
        AND locked_at < NOW() - ($1 || ' minutes')::interval
      RETURNING id;
    `, [timeoutMinutes]);
    return res.rowCount || 0;
  }

  /**
   * Extends / renews the active lease of a running job during long execution
   */
  async renewJobLease(id: string, claimToken: string, workerId: string): Promise<boolean> {
    const pool = getDbPool();
    const res = await pool.query(
      `
      UPDATE scheduled_jobs
      SET locked_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND claim_token = $2 AND locked_by = $3 AND status = 'running'
      RETURNING id;
      `,
      [id, claimToken, workerId]
    );
    return (res.rowCount || 0) > 0;
  }

  /**
   * Concurrency-safe job claiming using FOR UPDATE SKIP LOCKED and generation claim_token
   */
  async claimNextJob(workerId: string, supportedTypes?: string[]): Promise<ScheduledJob | null> {
    const { withTransaction } = await import('../db');

    for (let retry = 0; retry < 3; retry++) {
      const claimed = await withTransaction(async (client) => {
        let typeClause = '';
        const selectParams: unknown[] = [];

        if (supportedTypes && supportedTypes.length > 0) {
          typeClause = `AND job_type = ANY($1::text[])`;
          selectParams.push(supportedTypes);
        }

        // Concurrency-safe select: FOR UPDATE SKIP LOCKED on real PostgreSQL, FOR UPDATE on in-memory emulator
        const isRealPostgres = process.env.DATABASE_URL && process.env.DATABASE_URL !== 'memory';
        const lockClause = isRealPostgres ? 'FOR UPDATE SKIP LOCKED' : 'FOR UPDATE';
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
        const claimToken = crypto.randomUUID();

        // Atomic claim with OCC & claim_token guard: only update if status is still 'pending'
        const updateRes = await client.query(
          `
          UPDATE scheduled_jobs
          SET status = 'running',
              locked_at = NOW(),
              locked_by = $1,
              claim_token = $3,
              attempts = attempts + 1,
              updated_at = NOW()
          WHERE id = $2 AND status = 'pending'
          RETURNING *;
          `,
          [workerId, candidateId, claimToken]
        );

        return updateRes.rows[0] || null;
      });

      if (claimed) return claimed;
    }

    return null;
  }

  async completeJob(
    id: string,
    _resultPayload?: any,
    leaseOptions?: { claimToken?: string; workerId?: string }
  ): Promise<boolean> {
    const pool = getDbPool();
    const { claimToken, workerId } = leaseOptions || {};
    let whereClause = 'WHERE id = $1';
    const params: unknown[] = [id];

    if (claimToken && workerId) {
      whereClause += ' AND claim_token = $2 AND locked_by = $3 AND status = \'running\'';
      params.push(claimToken, workerId);
    }

    const res = await pool.query(
      `
      UPDATE scheduled_jobs
      SET status = 'completed',
          locked_at = NULL,
          locked_by = NULL,
          claim_token = NULL,
          updated_at = NOW()
      ${whereClause}
      RETURNING id;
      `,
      params
    );
    return (res.rowCount || 0) > 0;
  }

  async failJob(
    id: string,
    error: string,
    optionsOrDelay?: number | { claimToken?: string; workerId?: string; retryDelaySeconds?: number }
  ): Promise<ScheduledJob | null> {
    const pool = getDbPool();
    let claimToken: string | undefined;
    let workerId: string | undefined;
    let retryDelaySeconds: number | undefined;

    if (typeof optionsOrDelay === 'number') {
      retryDelaySeconds = optionsOrDelay;
    } else if (optionsOrDelay) {
      claimToken = optionsOrDelay.claimToken;
      workerId = optionsOrDelay.workerId;
      retryDelaySeconds = optionsOrDelay.retryDelaySeconds;
    }

    // Check attempts vs max_attempts, verifying ownership if token provided
    let checkQuery = 'SELECT attempts, max_attempts FROM scheduled_jobs WHERE id = $1';
    const checkParams: unknown[] = [id];
    if (claimToken && workerId) {
      checkQuery += ' AND claim_token = $2 AND locked_by = $3 AND status = \'running\'';
      checkParams.push(claimToken, workerId);
    }

    const getRes = await pool.query(checkQuery, checkParams);
    if (!getRes.rows[0]) return null;

    const { attempts, max_attempts } = getRes.rows[0];
    const willRetry = attempts < max_attempts && (retryDelaySeconds !== undefined ? retryDelaySeconds > 0 : true);
    const nextStatus = willRetry ? 'pending' : 'failed';
    const nextRunAt = willRetry
      ? new Date(Date.now() + (retryDelaySeconds || Math.min(3600, 30 * Math.pow(2, attempts - 1))) * 1000)
      : new Date();

    let updateWhere = 'WHERE id = $1';
    const updateParams: unknown[] = [id, nextStatus, error, nextRunAt.toISOString()];
    if (claimToken && workerId) {
      updateWhere += ' AND claim_token = $5 AND locked_by = $6 AND status = \'running\'';
      updateParams.push(claimToken, workerId);
    }

    const updateRes = await pool.query(
      `
      UPDATE scheduled_jobs
      SET status = $2,
          last_error = $3,
          locked_at = NULL,
          locked_by = NULL,
          claim_token = NULL,
          run_at = $4,
          updated_at = NOW()
      ${updateWhere}
      RETURNING *;
      `,
      updateParams
    );

    return updateRes.rows[0] || null;
  }

  async releaseJob(id: string, leaseOptions?: { claimToken?: string; workerId?: string }): Promise<boolean> {
    const pool = getDbPool();
    const { claimToken, workerId } = leaseOptions || {};
    let whereClause = 'WHERE id = $1';
    const params: unknown[] = [id];

    if (claimToken && workerId) {
      whereClause += ' AND claim_token = $2 AND locked_by = $3 AND status = \'running\'';
      params.push(claimToken, workerId);
    }

    const res = await pool.query(
      `
      UPDATE scheduled_jobs
      SET status = 'pending',
          locked_at = NULL,
          locked_by = NULL,
          claim_token = NULL,
          updated_at = NOW()
      ${whereClause};
      `,
      params
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
