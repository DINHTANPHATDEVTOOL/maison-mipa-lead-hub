/**
 * Data Migration Script: JSON to PostgreSQL
 * Supports --dry-run and --execute flags.
 *
 * Usage:
 *   npx tsx scripts/migrate-from-json.ts --dry-run
 *   npx tsx scripts/migrate-from-json.ts --execute
 */

import fs from 'fs';
import path from 'path';
import { getDbPool } from '../src/lib/db';
import { runMigrations } from '../src/lib/db/migrate';
import { canonicalizeFacebookUrl } from '../src/worker/crawler';

interface MigrationStats {
  services: { total: number; success: number; failed: number };
  templates: { total: number; success: number; failed: number };
  groups: { total: number; success: number; failed: number };
  posts: { total: number; success: number; failed: number };
  interactions: { total: number; success: number; failed: number };
  crm_leads: { total: number; success: number; failed: number };
  revoked_tokens: { total: number; success: number; failed: number };
}

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isDryRun = args.includes('--dry-run') || !isExecute;

  console.log('='.repeat(60));
  console.log(`[MIGRATION] JSON to PostgreSQL Migration`);
  console.log(`[MODE] ${isDryRun ? 'DRY-RUN (No changes committed to DB)' : 'EXECUTE (Inserting into PostgreSQL)'}`);
  console.log('='.repeat(60));

  const dataDir = path.join(process.cwd(), 'data');
  const storeFile = path.join(dataDir, 'mipa_shared_store.json');
  const revokedFile = path.join(dataDir, 'revoked_tokens.json');

  if (!fs.existsSync(storeFile)) {
    console.error(`[ERROR] Không tìm thấy file dữ liệu: ${storeFile}`);
    process.exit(1);
  }

  const rawStore = fs.readFileSync(storeFile, 'utf-8');
  const store = JSON.parse(rawStore);

  const stats: MigrationStats = {
    services: { total: 0, success: 0, failed: 0 },
    templates: { total: 0, success: 0, failed: 0 },
    groups: { total: 0, success: 0, failed: 0 },
    posts: { total: 0, success: 0, failed: 0 },
    interactions: { total: 0, success: 0, failed: 0 },
    crm_leads: { total: 0, success: 0, failed: 0 },
    revoked_tokens: { total: 0, success: 0, failed: 0 },
  };

  const pool = getDbPool();

  if (isExecute) {
    console.log('[MIGRATION] Ensuring database schema is up-to-date...');
    await runMigrations();
  }

  // 1. Services
  const services = Array.isArray(store.services) ? store.services : [];
  stats.services.total = services.length;
  console.log(`\n[1/7] Migrating Services (${services.length} items)...`);
  for (const s of services) {
    try {
      if (!s.id || !s.name || !s.code) throw new Error('Missing required fields (id, name, code)');
      if (isExecute) {
        await pool.query(
          `
          INSERT INTO services (id, code, name, base_price, price_note, service_area, includes_posing_support, is_active, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
          ON CONFLICT (id) DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            base_price = EXCLUDED.base_price,
            price_note = EXCLUDED.price_note,
            service_area = EXCLUDED.service_area,
            includes_posing_support = EXCLUDED.includes_posing_support,
            is_active = EXCLUDED.is_active,
            updated_at = NOW();
          `,
          [
            s.id,
            s.code,
            s.name,
            s.base_price || 0,
            s.price_note || '',
            s.service_area || '',
            Boolean(s.includes_posing_support),
            s.is_active !== undefined ? Boolean(s.is_active) : true,
          ]
        );
      }
      stats.services.success++;
    } catch (e: any) {
      stats.services.failed++;
      console.error(`  - Failed service ${s.id}: ${e.message}`);
    }
  }

  // 2. Outreach Templates
  const templates = Array.isArray(store.templates) ? store.templates : [];
  stats.templates.total = templates.length;
  console.log(`\n[2/7] Migrating Templates (${templates.length} items)...`);
  for (const t of templates) {
    try {
      if (!t.id || !t.template_content) throw new Error('Missing required fields');
      if (isExecute) {
        await pool.query(
          `
          INSERT INTO outreach_templates (id, service_id, title, template_content, allowed_placeholders, is_approved, version, updated_by_name, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO UPDATE SET
            service_id = EXCLUDED.service_id,
            title = EXCLUDED.title,
            template_content = EXCLUDED.template_content,
            allowed_placeholders = EXCLUDED.allowed_placeholders,
            is_approved = EXCLUDED.is_approved,
            version = EXCLUDED.version,
            updated_by_name = EXCLUDED.updated_by_name,
            updated_at = EXCLUDED.updated_at;
          `,
          [
            t.id,
            t.service_id || null,
            t.title || '',
            t.template_content,
            JSON.stringify(t.allowed_placeholders || []),
            Boolean(t.is_approved),
            t.version || 1,
            t.updated_by_name || 'Admin',
            t.updated_at || new Date().toISOString(),
          ]
        );
      }
      stats.templates.success++;
    } catch (e: any) {
      stats.templates.failed++;
      console.error(`  - Failed template ${t.id}: ${e.message}`);
    }
  }

  // 3. Groups
  const groups = Array.isArray(store.groups) ? store.groups : [];
  stats.groups.total = groups.length;
  console.log(`\n[3/7] Migrating Facebook Groups (${groups.length} items)...`);
  for (const g of groups) {
    try {
      if (!g.id || !g.name) throw new Error('Missing required fields (id, name)');
      const groupUrl = g.url || g.group_url;
      if (!groupUrl) throw new Error('Missing group URL');

      if (isExecute) {
        await pool.query(
          `
          INSERT INTO facebook_groups (
            id, name, url, check_interval_seconds, lookback_hours, status,
            last_checked_at, next_check_at, total_posts_found, last_error_message,
            can_page_comment, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            url = EXCLUDED.url,
            check_interval_seconds = EXCLUDED.check_interval_seconds,
            lookback_hours = EXCLUDED.lookback_hours,
            status = EXCLUDED.status,
            last_checked_at = EXCLUDED.last_checked_at,
            next_check_at = EXCLUDED.next_check_at,
            total_posts_found = EXCLUDED.total_posts_found,
            last_error_message = EXCLUDED.last_error_message,
            can_page_comment = EXCLUDED.can_page_comment,
            updated_at = NOW();
          `,
          [
            g.id,
            g.name,
            groupUrl,
            g.check_interval_seconds || 150,
            g.lookback_hours || 24,
            g.status || 'active',
            g.last_checked_at ? new Date(g.last_checked_at).toISOString() : null,
            g.next_check_at ? new Date(g.next_check_at).toISOString() : null,
            g.total_posts_found || 0,
            g.last_error_message || null,
            g.can_page_comment !== undefined ? Boolean(g.can_page_comment) : true,
            g.created_at ? new Date(g.created_at).toISOString() : new Date().toISOString(),
          ]
        );
      }
      stats.groups.success++;
    } catch (e: any) {
      stats.groups.failed++;
      console.error(`  - Failed group ${g.id}: ${e.message}`);
    }
  }

  // 4. Posts & Interactions
  const posts = Array.isArray(store.posts) ? store.posts : [];
  stats.posts.total = posts.length;
  console.log(`\n[4/7] Migrating Facebook Posts (${posts.length} items)...`);
  for (const p of posts) {
    try {
      const rawUrl = p.post_url || '';
      const { canonicalUrl, urlHash } = canonicalizeFacebookUrl(rawUrl);
      const postHash = p.post_url_hash || urlHash;
      const postId = p.id;
      if (!postId) throw new Error('Missing post ID');

      if (isExecute) {
        await pool.query(
          `
          INSERT INTO facebook_posts (
            id, group_id, group_name, facebook_post_id, post_url, post_url_hash,
            author_name, content_raw, posted_at, detected_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (post_url_hash) DO UPDATE SET
            group_name = EXCLUDED.group_name,
            facebook_post_id = EXCLUDED.facebook_post_id,
            author_name = EXCLUDED.author_name,
            content_raw = EXCLUDED.content_raw;
          `,
          [
            postId,
            p.group_id || null,
            p.group_name || null,
            p.facebook_post_id || null,
            canonicalUrl || rawUrl,
            postHash,
            p.author_name || 'Khách hàng',
            p.content_raw || '',
            p.posted_at ? new Date(p.posted_at).toISOString() : null,
            p.detected_at ? new Date(p.detected_at).toISOString() : new Date().toISOString(),
          ]
        );

        // Migrate interaction if attached to post
        if (p.interaction) {
          stats.interactions.total++;
          const oi = p.interaction;
          const templateUsedId = templates.some((t: any) => t.id === oi.template_used_id) ? oi.template_used_id : null;
          const interactionId = `int_${postId}`;

          await pool.query(
            `
            INSERT INTO outreach_interactions (
              id, post_id, page_identity, operator_name, template_used_id,
              comment_content, status, comment_facebook_id, comment_permalink,
              error_message, dispatched_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
            ON CONFLICT (post_id) DO UPDATE SET
              status = EXCLUDED.status,
              comment_permalink = EXCLUDED.comment_permalink,
              dispatched_at = EXCLUDED.dispatched_at,
              updated_at = NOW();
            `,
            [
              interactionId,
              postId,
              oi.page_identity || 'Maison MIPA Photography',
              oi.operator_name || 'Hệ thống',
              templateUsedId,
              oi.comment_content || '',
              oi.status || 'sent_confirmed',
              oi.comment_facebook_id || null,
              oi.comment_permalink || null,
              oi.error_message || null,
              oi.dispatched_at ? new Date(oi.dispatched_at).toISOString() : new Date().toISOString(),
            ]
          );
          stats.interactions.success++;
        }
      }
      stats.posts.success++;
    } catch (e: any) {
      stats.posts.failed++;
      console.error(`  - Failed post ${p.id}: ${e.message}`);
    }
  }

  // 5. CRM Leads
  const crmLeads = Array.isArray(store.crm_leads) ? store.crm_leads : [];
  stats.crm_leads.total = crmLeads.length;
  console.log(`\n[5/7] Migrating CRM Leads (${crmLeads.length} items)...`);
  for (const l of crmLeads) {
    try {
      if (!l.id) throw new Error('Missing lead ID');
      if (isExecute) {
        await pool.query(
          `
          INSERT INTO crm_leads (
            id, post_id, customer_name, customer_facebook_url, service_interest,
            stage, assigned_cskh_name, booking_date, quoted_amount, notes,
            post_summary, version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          ON CONFLICT (id) DO UPDATE SET
            customer_name = EXCLUDED.customer_name,
            service_interest = EXCLUDED.service_interest,
            stage = EXCLUDED.stage,
            assigned_cskh_name = EXCLUDED.assigned_cskh_name,
            booking_date = EXCLUDED.booking_date,
            quoted_amount = EXCLUDED.quoted_amount,
            notes = EXCLUDED.notes,
            version = EXCLUDED.version,
            updated_at = NOW();
          `,
          [
            l.id,
            l.post_id || null,
            l.customer_name || 'Khách hàng',
            l.customer_facebook_url || null,
            l.service_interest || null,
            l.stage || 'uncontacted',
            l.assigned_cskh_name || 'CSKH Team',
            l.booking_date ? new Date(l.booking_date).toISOString() : null,
            l.quoted_amount || 0,
            l.notes || null,
            l.post_summary || null,
            l.version || 1,
            l.created_at ? new Date(l.created_at).toISOString() : new Date().toISOString(),
          ]
        );
      }
      stats.crm_leads.success++;
    } catch (e: any) {
      stats.crm_leads.failed++;
      console.error(`  - Failed lead ${l.id}: ${e.message}`);
    }
  }

  // 6. Outreach Interactions (independent array if any)
  const separateInteractions = Array.isArray(store.outreach_interactions) ? store.outreach_interactions : [];
  if (separateInteractions.length > 0) {
    stats.interactions.total += separateInteractions.length;
    console.log(`\n[6/7] Migrating Standalone Interactions (${separateInteractions.length} items)...`);
    for (const oi of separateInteractions) {
      try {
        if (!oi.id || !oi.post_id) throw new Error('Missing ID or post_id');
        const templateUsedId = templates.some((t: any) => t.id === oi.template_used_id) ? oi.template_used_id : null;
        const interactionId = oi.id || `int_${oi.post_id}`;

        if (isExecute) {
          await pool.query(
            `
            INSERT INTO outreach_interactions (
              id, post_id, page_identity, operator_name, template_used_id,
              comment_content, status, comment_facebook_id, comment_permalink,
              error_message, dispatched_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
            ON CONFLICT (post_id) DO UPDATE SET
              status = EXCLUDED.status,
              comment_permalink = EXCLUDED.comment_permalink,
              dispatched_at = EXCLUDED.dispatched_at,
              updated_at = NOW();
            `,
            [
              interactionId,
              oi.post_id,
              oi.page_identity || 'Maison MIPA Photography',
              oi.operator_name || 'Hệ thống',
              templateUsedId,
              oi.comment_content || '',
              oi.status || 'sent_confirmed',
              oi.comment_facebook_id || null,
              oi.comment_permalink || null,
              oi.error_message || null,
              oi.dispatched_at ? new Date(oi.dispatched_at).toISOString() : new Date().toISOString(),
            ]
          );
        }
        stats.interactions.success++;
      } catch (e: any) {
        stats.interactions.failed++;
        console.error(`  - Failed interaction ${oi.id}: ${e.message}`);
      }
    }
  }

  // 7. Revoked Tokens
  if (fs.existsSync(revokedFile)) {
    try {
      const revokedList: string[] = JSON.parse(fs.readFileSync(revokedFile, 'utf-8'));
      stats.revoked_tokens.total = revokedList.length;
      console.log(`\n[7/7] Migrating Revoked Tokens (${revokedList.length} items)...`);
      for (const token of revokedList) {
        try {
          if (isExecute) {
            const { authRepo } = await import('../src/lib/repositories/auth.repository');
            await authRepo.revokeToken(token);
          }
          stats.revoked_tokens.success++;
        } catch {
          stats.revoked_tokens.failed++;
        }
      }
    } catch (e: any) {
      console.error('[MIGRATION] Failed parsing revoked_tokens.json:', e.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`[MIGRATION SUMMARY] Result (${isDryRun ? 'DRY RUN' : 'EXECUTED'}):`);
  console.log('='.repeat(60));
  for (const [entity, s] of Object.entries(stats)) {
    console.log(`  - ${entity.padEnd(16)}: Total ${s.total} | Success: ${s.success} | Failed: ${s.failed}`);
  }
  console.log('='.repeat(60));
  console.log('[MIGRATION] Finished successfully.\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[FATAL] Migration script failed:', err);
    process.exit(1);
  });
}
