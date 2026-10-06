import { OutreachInteraction, OutreachStatus } from '@/types';
import { getDbPool } from '../db';

export class OutreachRepository {
  private static instance: OutreachRepository;

  public static getInstance(): OutreachRepository {
    if (!OutreachRepository.instance) {
      OutreachRepository.instance = new OutreachRepository();
    }
    return OutreachRepository.instance;
  }

  public async getByPostId(postId: string): Promise<OutreachInteraction | null> {
    const pool = getDbPool();
    const res = await pool.query('SELECT * FROM outreach_interactions WHERE post_id = $1', [postId]);
    if (res.rows.length === 0) return null;
    return this.mapRow(res.rows[0]);
  }

  /**
   * Attempt to claim or initiate an outreach interaction.
   * Enforced strictly by PostgreSQL UNIQUE(post_id) constraint.
   * Returns { success: true, interaction } if this worker/request won the first-touch claim.
   * Returns { success: false, existing } if already claimed or dispatched.
   */
  public async claimFirstTouch(data: {
    post_id: string;
    page_identity: string;
    operator_name?: string;
    template_used_id?: string;
    comment_content: string;
    initialStatus?: OutreachStatus;
  }): Promise<{ success: boolean; interaction: OutreachInteraction | null }> {
    const pool = getDbPool();
    const interactionId = `int_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      const res = await pool.query(`
        INSERT INTO outreach_interactions (
          id, post_id, page_identity, operator_name, template_used_id,
          comment_content, status, dispatched_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW()
        )
        RETURNING *
      `, [
        interactionId,
        data.post_id,
        data.page_identity,
        data.operator_name || 'System Worker',
        data.template_used_id || null,
        data.comment_content,
        data.initialStatus || 'sending',
      ]);

      const interaction = this.mapRow(res.rows[0]);
      await this.recordAttempt({
        post_id: data.post_id,
        page_name: data.page_identity,
        template_id: data.template_used_id,
        comment_content: data.comment_content,
        status: data.initialStatus || 'sending',
        attempted_by: data.operator_name || 'System Worker',
      });

      return { success: true, interaction };
    } catch (err: any) {
      // 23505 is PostgreSQL unique_violation code
      if (err.code === '23505' || err.message?.includes('unique_first_touch_outreach')) {
        const existing = await this.getByPostId(data.post_id);

        // State Machine: If previously failed strictly BEFORE submit, allow controlled CAS re-claim
        if (existing && (existing.status === 'failed_before_submit' || existing.status === 'rejected')) {
          const reclaimRes = await pool.query(`
            UPDATE outreach_interactions
            SET status = $1,
                operator_name = $2,
                page_identity = $3,
                comment_content = $4,
                template_used_id = $5,
                error_message = NULL,
                updated_at = NOW()
            WHERE post_id = $6 AND status IN ('failed_before_submit', 'rejected')
            RETURNING *;
          `, [
            data.initialStatus || 'sending',
            data.operator_name || 'System Worker',
            data.page_identity,
            data.comment_content,
            data.template_used_id || null,
            data.post_id,
          ]);

          if (reclaimRes.rows.length > 0) {
            const reclaimed = this.mapRow(reclaimRes.rows[0]);
            await this.recordAttempt({
              post_id: data.post_id,
              page_name: data.page_identity,
              template_id: data.template_used_id,
              comment_content: data.comment_content,
              status: data.initialStatus || 'sending',
              attempted_by: data.operator_name || 'System Worker',
            });
            return { success: true, interaction: reclaimed };
          }
        }

        return { success: false, interaction: existing };
      }
      throw err;
    }
  }

  public async updateStatus(
    postId: string,
    status: OutreachStatus,
    details?: {
      comment_facebook_id?: string;
      comment_permalink?: string;
      error_message?: string;
      notes?: string;
    }
  ): Promise<OutreachInteraction | null> {
    const pool = getDbPool();
    const res = await pool.query(`
      UPDATE outreach_interactions
      SET
        status = $1,
        comment_facebook_id = COALESCE($2, comment_facebook_id),
        comment_permalink = COALESCE($3, comment_permalink),
        error_message = $4,
        updated_at = NOW()
      WHERE post_id = $5
      RETURNING *
    `, [
      status,
      details?.comment_facebook_id || null,
      details?.comment_permalink || null,
      details?.error_message || details?.notes || null,
      postId,
    ]);

    if (res.rows.length === 0) return null;
    const interaction = this.mapRow(res.rows[0]);

    await this.recordAttempt({
      post_id: postId,
      page_name: interaction.page_identity,
      template_id: interaction.template_used_id,
      comment_content: interaction.comment_content,
      status,
      error_message: details?.error_message,
      attempted_by: interaction.operator_name,
    });

    return interaction;
  }

  public async recordAttempt(attempt: {
    post_id: string;
    page_id?: string;
    page_name?: string;
    template_id?: string;
    comment_content: string;
    status: string;
    error_message?: string;
    evidence_json?: any;
    attempted_by?: string;
  }): Promise<void> {
    const pool = getDbPool();
    try {
      const countRes = await pool.query(
        'SELECT count(*) as cnt FROM outreach_attempts WHERE post_id = $1',
        [attempt.post_id]
      );
      const nextAttemptNumber = Number(countRes.rows[0].cnt || 0) + 1;
      const attemptId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      await pool.query(`
        INSERT INTO outreach_attempts (
          id, post_id, page_id, page_name, template_id, comment_content,
          status, attempt_number, error_message, evidence_json, attempted_by, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
        )
      `, [
        attemptId,
        attempt.post_id,
        attempt.page_id || null,
        attempt.page_name || 'Maison MIPA',
        attempt.template_id || null,
        attempt.comment_content,
        attempt.status,
        nextAttemptNumber,
        attempt.error_message || null,
        JSON.stringify(attempt.evidence_json || {}),
        attempt.attempted_by || 'Worker',
      ]);
    } catch (e) {
      console.error('[OutreachRepository] Lỗi khi ghi attempt:', e);
    }
  }

  public async getAttempts(postId: string): Promise<any[]> {
    const pool = getDbPool();
    const res = await pool.query(`
      SELECT * FROM outreach_attempts WHERE post_id = $1 ORDER BY attempt_number ASC
    `, [postId]);
    return res.rows;
  }

  private mapRow(row: any): OutreachInteraction {
    return {
      id: row.id,
      post_id: row.post_id,
      page_identity: row.page_identity,
      operator_name: row.operator_name || 'System Worker',
      template_used_id: row.template_used_id,
      comment_content: row.comment_content || '',
      status: row.status,
      comment_facebook_id: row.comment_facebook_id,
      comment_permalink: row.comment_permalink,
      error_message: row.error_message,
      dispatched_at: row.dispatched_at ? new Date(row.dispatched_at).toISOString() : new Date().toISOString(),
    };
  }
}

export const outreachRepo = OutreachRepository.getInstance();
