import { FacebookPost, LeadClassification, OutreachInteraction } from '@/types';
import { getDbPool, withTransaction } from '../db';
import { canonicalizeFacebookUrl } from '@/worker/crawler';
import { classifyPostContent, ClassificationResult } from '@/lib/classifier';
import { leadRepo } from './lead.repository';
import { serviceRepo } from './service.repository';
import { templateRepo } from './template.repository';

export class PostRepository {
  private static instance: PostRepository;

  public static getInstance(): PostRepository {
    if (!PostRepository.instance) {
      PostRepository.instance = new PostRepository();
    }
    return PostRepository.instance;
  }

  public async getAll(filter?: { intent?: string; reviewStatus?: string; groupId?: string }): Promise<FacebookPost[]> {
    const pool = getDbPool();
    const conditions: string[] = [];
    const params: any[] = [];

    if (filter?.intent) {
      params.push(filter.intent);
      conditions.push(`c.intent = $${params.length}`);
    }
    if (filter?.reviewStatus) {
      params.push(filter.reviewStatus);
      conditions.push(`c.review_status = $${params.length}`);
    }
    if (filter?.groupId) {
      params.push(filter.groupId);
      conditions.push(`p.group_id = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const res = await pool.query(`
      SELECT 
        p.id,
        p.group_id,
        p.group_name,
        p.facebook_post_id,
        p.post_url,
        p.post_url_hash,
        p.author_name,
        p.content_raw,
        p.posted_at,
        p.detected_at,
        p.created_at,
        c.id as class_id,
        c.intent,
        c.service_detected,
        c.location,
        c.pax,
        c.shooting_date_text,
        c.shooting_date_suggested,
        c.budget_raw,
        c.extra_requirements,
        c.confidence_score,
        c.classification_reason,
        c.suggested_template_id,
        c.suggested_comment_text,
        c.review_status,
        c.reviewed_by,
        c.reviewed_at,
        o.id as out_id,
        o.page_identity,
        o.operator_name,
        o.template_used_id,
        o.comment_content,
        o.status as out_status,
        o.comment_facebook_id,
        o.comment_permalink,
        o.error_message,
        o.dispatched_at
      FROM facebook_posts p
      LEFT JOIN lead_classifications c ON c.post_id = p.id
      LEFT JOIN outreach_interactions o ON o.post_id = p.id
      ${whereClause}
      ORDER BY p.detected_at DESC
    `, params);

    return res.rows.map(this.mapRowWithRelations);
  }

  public async getById(id: string): Promise<FacebookPost | null> {
    const pool = getDbPool();
    const res = await pool.query(`
      SELECT 
        p.*,
        c.id as class_id,
        c.intent,
        c.service_detected,
        c.location,
        c.pax,
        c.shooting_date_text,
        c.shooting_date_suggested,
        c.budget_raw,
        c.extra_requirements,
        c.confidence_score,
        c.classification_reason,
        c.suggested_template_id,
        c.suggested_comment_text,
        c.review_status,
        c.reviewed_by,
        c.reviewed_at,
        o.id as out_id,
        o.page_identity,
        o.operator_name,
        o.template_used_id,
        o.comment_content,
        o.status as out_status,
        o.comment_facebook_id,
        o.comment_permalink,
        o.error_message,
        o.dispatched_at
      FROM facebook_posts p
      LEFT JOIN lead_classifications c ON c.post_id = p.id
      LEFT JOIN outreach_interactions o ON o.post_id = p.id
      WHERE p.id = $1
    `, [id]);

    if (res.rows.length === 0) return null;
    return this.mapRowWithRelations(res.rows[0]);
  }

  public async getByFacebookPostId(fbPostId: string): Promise<FacebookPost | null> {
    const pool = getDbPool();
    const res = await pool.query('SELECT id FROM facebook_posts WHERE facebook_post_id = $1', [fbPostId]);
    if (res.rows.length === 0) return null;
    return this.getById(res.rows[0].id);
  }

  public async getByUrlHash(hash: string): Promise<FacebookPost | null> {
    const pool = getDbPool();
    const res = await pool.query('SELECT id FROM facebook_posts WHERE post_url_hash = $1', [hash]);
    if (res.rows.length === 0) return null;
    return this.getById(res.rows[0].id);
  }

  public async ensureClassification(existingPost: FacebookPost): Promise<ClassificationResult | undefined> {
    if (existingPost.classification) {
      return existingPost.classification as any;
    }
    const pool = getDbPool();
    const checkRes = await pool.query('SELECT * FROM lead_classifications WHERE post_id = $1', [existingPost.id]);
    if (checkRes.rows.length > 0) {
      const row = checkRes.rows[0];
      const clsResult: any = {
        id: row.id,
        post_id: row.post_id,
        intent: row.intent,
        service_detected: row.service_detected,
        location: row.location,
        pax: row.pax,
        shooting_date_text: row.shooting_date_text,
        shooting_date_suggested: row.shooting_date_suggested ? new Date(row.shooting_date_suggested).toISOString().split('T')[0] : null,
        budget_raw: row.budget_raw,
        extra_requirements: row.extra_requirements ? row.extra_requirements.split(', ') : [],
        confidence_score: Number(row.confidence_score),
        classification_reason: row.classification_reason,
        suggested_template_id: row.suggested_template_id,
        suggested_comment_text: row.suggested_comment_text,
        review_status: row.review_status,
      };
      existingPost.classification = clsResult;
      return clsResult;
    }

    // Auto-heal: Post exists in DB but lacks classification record
    const services = await serviceRepo.getAll().catch(() => []);
    const templates = await templateRepo.getAll().catch(() => []);
    const classification = classifyPostContent(existingPost.content_raw, services, templates, existingPost.posted_at);
    const safeScore = Math.min(100, Math.max(0, Number(classification.confidence_score) || 0));
    const extraReqs = Array.isArray(classification.extra_requirements)
      ? classification.extra_requirements.join(', ')
      : (typeof classification.extra_requirements === 'string' ? classification.extra_requirements : '');
    const healedClsId = `cls_${existingPost.id}`;

    await pool.query(`
      INSERT INTO lead_classifications (
        id, post_id, intent, service_detected, location, pax, shooting_date_text,
        shooting_date_suggested, budget_raw, extra_requirements, confidence_score,
        classification_reason, suggested_template_id, suggested_comment_text, review_status, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
      )
      ON CONFLICT (post_id) DO NOTHING
    `, [
      healedClsId,
      existingPost.id,
      classification.intent,
      classification.service_detected,
      classification.location,
      classification.pax,
      classification.shooting_date_text,
      classification.shooting_date_suggested ? new Date(classification.shooting_date_suggested) : null,
      classification.budget_raw,
      extraReqs,
      safeScore,
      classification.classification_reason,
      classification.suggested_template_id || null,
      classification.suggested_comment_text || null,
      classification.review_status || 'pending',
    ]);

    existingPost.classification = {
      ...classification,
      id: healedClsId,
      post_id: existingPost.id,
      extra_requirements: classification.extra_requirements,
      confidence_score: safeScore,
      review_status: classification.review_status || 'pending',
      created_at: new Date().toISOString(),
    } as any;

    return classification;
  }

  public async createIfNew(postData: {
    id?: string;
    group_id?: string;
    group_name?: string;
    facebook_post_id?: string;
    post_url?: string;
    author_name?: string;
    content_raw: string;
    posted_at?: string;
  }): Promise<{ post: FacebookPost; isNew: boolean; classification?: ClassificationResult }> {
    const pool = getDbPool();
    const rawUrl = postData.post_url || '';
    const { canonicalUrl, urlHash, postId: extractedFbId } = canonicalizeFacebookUrl(rawUrl);
    const fbPostId = postData.facebook_post_id?.trim() || extractedFbId;

    // 1. Check deduplication by facebook_post_id if available
    if (fbPostId) {
      const existing = await this.getByFacebookPostId(fbPostId);
      if (existing) {
        const cls = await this.ensureClassification(existing);
        return { post: existing, isNew: false, classification: cls };
      }
    }

    // 2. Check deduplication by URL hash
    if (urlHash) {
      const existing = await this.getByUrlHash(urlHash);
      if (existing) {
        const cls = await this.ensureClassification(existing);
        return { post: existing, isNew: false, classification: cls };
      }
    }

    // 3. Prepare IDs and classification beforehand
    const finalFbId = fbPostId || null;
    const finalUrl = canonicalUrl || rawUrl || `https://facebook.com/posts/${Date.now()}`;
    const finalHash = urlHash || require('crypto').createHash('sha256').update(finalUrl).digest('hex');
    const postId = postData.id || ('post_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9));

    const services = await serviceRepo.getAll().catch(() => []);
    const templates = await templateRepo.getAll().catch(() => []);
    const classification = classifyPostContent(postData.content_raw, services, templates, postData.posted_at);

    const safeScore = Math.min(100, Math.max(0, Number(classification.confidence_score) || 0));
    const extraReqs = Array.isArray(classification.extra_requirements)
      ? classification.extra_requirements.join(', ')
      : (typeof classification.extra_requirements === 'string' ? classification.extra_requirements : '');

    // 4. Atomic transaction: Insert post + classification
    const txResult = await withTransaction(async (client) => {
      const insertRes = await client.query(`
        INSERT INTO facebook_posts (
          id, group_id, group_name, facebook_post_id, post_url, post_url_hash, author_name, content_raw, posted_at, detected_at, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
        )
        ON CONFLICT (post_url_hash) DO NOTHING
        RETURNING *
      `, [
        postId,
        postData.group_id || null,
        postData.group_name || 'Nhóm Facebook',
        finalFbId,
        finalUrl,
        finalHash,
        postData.author_name || 'Khách Hàng',
        postData.content_raw.trim(),
        postData.posted_at ? new Date(postData.posted_at) : null,
      ]);

      if (insertRes.rows.length === 0) {
        // Post already exists in DB
        const existingRes = await client.query('SELECT * FROM facebook_posts WHERE post_url_hash = $1', [finalHash]);
        if (existingRes.rows.length > 0) {
          const existingPost = this.mapRow(existingRes.rows[0]);
          const cls = await this.ensureClassification(existingPost);
          return { post: existingPost, isNew: false, classification: cls };
        }
      }

      const createdPost = this.mapRow(insertRes.rows[0]);
      classification.post_id = createdPost.id;
      const classId = `cls_${createdPost.id}`;

      await client.query(`
        INSERT INTO lead_classifications (
          id, post_id, intent, service_detected, location, pax, shooting_date_text,
          shooting_date_suggested, budget_raw, extra_requirements, confidence_score,
          classification_reason, suggested_template_id, suggested_comment_text, review_status, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
        )
        ON CONFLICT (post_id) DO NOTHING
      `, [
        classId,
        createdPost.id,
        classification.intent,
        classification.service_detected,
        classification.location,
        classification.pax,
        classification.shooting_date_text,
        classification.shooting_date_suggested ? new Date(classification.shooting_date_suggested) : null,
        classification.budget_raw,
        extraReqs,
        safeScore,
        classification.classification_reason,
        classification.suggested_template_id || null,
        classification.suggested_comment_text || null,
        classification.review_status || 'pending',
      ]);

      return { post: { ...createdPost, classification: classification as any }, isNew: true, classification };
    });

    // 5. Automatically create uncontacted CRM Lead if intent matches
    if (txResult.isNew && classification.intent === 'looking_for_service') {
      try {
        await leadRepo.create({
          post_id: txResult.post.id,
          customer_name: postData.author_name || 'Khách Hàng Facebook',
          customer_facebook_url: finalUrl,
          service_interest: classification.service_detected || 'Chụp Ảnh Concept',
          stage: 'uncontacted',
          assigned_cskh_name: 'CSKH Team',
          notes: `[Phát hiện tự động]: ${classification.classification_reason}`,
          post_summary: postData.content_raw.slice(0, 150),
        });
      } catch {}
    }

    return { post: txResult.post, isNew: txResult.isNew, classification: txResult.classification };
  }

  public async updateClassification(postId: string, classification: LeadClassification): Promise<boolean> {
    const pool = getDbPool();
    const classId = `cls_${postId}`;
    const res = await pool.query(`
      INSERT INTO lead_classifications (
        id, post_id, intent, service_detected, location, pax, shooting_date_text,
        shooting_date_suggested, budget_raw, extra_requirements, confidence_score,
        classification_reason, suggested_template_id, suggested_comment_text,
        review_status, reviewed_by, reviewed_at, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
      )
      ON CONFLICT (post_id) DO UPDATE SET
        intent = EXCLUDED.intent,
        service_detected = EXCLUDED.service_detected,
        location = EXCLUDED.location,
        pax = EXCLUDED.pax,
        shooting_date_text = EXCLUDED.shooting_date_text,
        shooting_date_suggested = EXCLUDED.shooting_date_suggested,
        budget_raw = EXCLUDED.budget_raw,
        extra_requirements = EXCLUDED.extra_requirements,
        confidence_score = EXCLUDED.confidence_score,
        classification_reason = EXCLUDED.classification_reason,
        suggested_template_id = EXCLUDED.suggested_template_id,
        suggested_comment_text = EXCLUDED.suggested_comment_text,
        review_status = EXCLUDED.review_status,
        reviewed_by = EXCLUDED.reviewed_by,
        reviewed_at = NOW()
    `, [
      classId,
      postId,
      classification.intent,
      classification.service_detected,
      classification.location,
      classification.pax,
      classification.shooting_date_text,
      classification.shooting_date_suggested ? new Date(classification.shooting_date_suggested) : null,
      classification.budget_raw,
      Array.isArray(classification.extra_requirements) ? classification.extra_requirements.join(', ') : (typeof classification.extra_requirements === 'string' ? classification.extra_requirements : ''),
      Math.min(100, Math.max(0, Number(classification.confidence_score) || 0)),
      classification.classification_reason,
      classification.suggested_template_id || null,
      classification.suggested_comment_text || null,
      classification.review_status || 'pending',
      classification.reviewed_by || 'Admin',
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  public async updateInteraction(postId: string, interaction: OutreachInteraction): Promise<boolean> {
    const pool = getDbPool();
    const interactionId = interaction.id || `int_${postId}`;
    const res = await pool.query(`
      INSERT INTO outreach_interactions (
        id, post_id, page_identity, operator_name, template_used_id,
        comment_content, status, comment_facebook_id, comment_permalink,
        error_message, dispatched_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), NOW()
      )
      ON CONFLICT (post_id) DO UPDATE SET
        page_identity = EXCLUDED.page_identity,
        operator_name = EXCLUDED.operator_name,
        template_used_id = EXCLUDED.template_used_id,
        comment_content = EXCLUDED.comment_content,
        status = EXCLUDED.status,
        comment_facebook_id = EXCLUDED.comment_facebook_id,
        comment_permalink = EXCLUDED.comment_permalink,
        error_message = EXCLUDED.error_message,
        updated_at = NOW()
    `, [
      interactionId,
      postId,
      interaction.page_identity,
      interaction.operator_name || 'System Worker',
      interaction.template_used_id || null,
      interaction.comment_content,
      interaction.status,
      interaction.comment_facebook_id || null,
      interaction.comment_permalink || null,
      interaction.error_message || null,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  private mapRow(row: any): FacebookPost {
    return this.mapRowWithRelations(row);
  }

  private mapRowWithRelations(row: any): FacebookPost {
    const post: FacebookPost = {
      id: row.id,
      group_id: row.group_id,
      group_name: row.group_name || 'Nhóm Facebook',
      facebook_post_id: row.facebook_post_id || undefined,
      post_url: row.post_url,
      post_url_hash: row.post_url_hash,
      author_name: row.author_name || 'Khách Hàng',
      content_raw: row.content_raw,
      posted_at: row.posted_at ? new Date(row.posted_at).toISOString() : new Date().toISOString(),
      detected_at: row.detected_at ? new Date(row.detected_at).toISOString() : new Date().toISOString(),
    };

    if (row.intent) {
      post.classification = {
        id: row.class_id || `cls-${row.id}`,
        post_id: row.id,
        intent: row.intent,
        service_detected: row.service_detected,
        location: row.location,
        pax: row.pax ? Number(row.pax) : null,
        shooting_date_text: row.shooting_date_text,
        shooting_date_suggested: row.shooting_date_suggested ? new Date(row.shooting_date_suggested).toISOString().split('T')[0] : null,
        budget_raw: row.budget_raw,
        extra_requirements: Array.isArray(row.extra_requirements) ? row.extra_requirements : [],
        confidence_score: Number(row.confidence_score || 0),
        classification_reason: row.classification_reason || '',
        suggested_template_id: row.suggested_template_id,
        suggested_comment_text: row.suggested_comment_text,
        review_status: row.review_status || 'pending_review',
        reviewed_by: row.reviewed_by,
      };
    }

    if (row.page_identity) {
      post.interaction = {
        id: row.out_id || `out-${row.id}`,
        post_id: row.id,
        page_identity: row.page_identity,
        operator_name: row.operator_name || 'System Worker',
        template_used_id: row.template_used_id,
        comment_content: row.comment_content || '',
        status: row.out_status || 'sending',
        comment_facebook_id: row.comment_facebook_id,
        comment_permalink: row.comment_permalink,
        error_message: row.error_message,
        dispatched_at: row.dispatched_at ? new Date(row.dispatched_at).toISOString() : new Date().toISOString(),
      };
    }

    return post;
  }
}

export const postRepo = PostRepository.getInstance();
