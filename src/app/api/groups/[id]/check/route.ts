import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';
import { authManager } from '@/worker/auth';
import { groupCrawler } from '@/worker/crawler';
import { classifyPostContent } from '@/lib/classifier';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = verifyAuth(req, ['admin', 'marketing']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const groups = store.getGroups();
    const group = groups.find(g => g.id === params.id);
    if (!group) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy nhóm trên hệ thống.' }, { status: 404 });
    }

    const sessionSummary = authManager.getSessionSummary();
    if (!sessionSummary.exists || !sessionSummary.valid) {
      store.updateGroup(group.id, {
        status: 'needs_auth',
        last_error_message: 'Chưa có phiên đăng nhập Facebook hợp lệ để quét bài thật.',
      });
      return NextResponse.json({
        success: false,
        needsAuth: true,
        error: 'Chưa có phiên Facebook hợp lệ. Vui lòng nạp session hoặc đăng nhập trước khi quét.',
      }, { status: 400 });
    }

    // Trigger REAL Playwright crawl
    console.log(`[Manual Trigger] Bắt đầu quét thực tế nhóm: ${group.name} (${group.url})`);
    const crawlResult = await groupCrawler.crawlGroup(group.url, group.lookback_hours);

    if (!crawlResult.success) {
      store.updateGroup(group.id, {
        status: crawlResult.needsAuth ? 'needs_auth' : 'error',
        last_error_message: crawlResult.error || 'Lỗi khi quét nhóm',
      });
      return NextResponse.json({
        success: false,
        error: crawlResult.error || 'Không thể cào dữ liệu từ nhóm Facebook này.',
        needsAuth: crawlResult.needsAuth,
      }, { status: 400 });
    }

    // Ingest & Classify crawled posts
    const services = store.getServices();
    const templates = store.getTemplates();
    let newCount = 0;

    for (const rawPost of crawlResult.posts) {
      const { post, isNew } = store.addPostIfNew({
        group_id: group.id,
        group_name: group.name,
        facebook_post_id: rawPost.facebook_post_id,
        post_url: rawPost.post_url,
        author_name: rawPost.author_name,
        content_raw: rawPost.content_raw,
        posted_at: rawPost.posted_at,
      });

      if (isNew) {
        newCount++;
        const classification = classifyPostContent(post.content_raw, services, templates, post.posted_at);
        store.updatePostClassification(post.id, {
          id: `cls-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          post_id: post.id,
          intent: classification.intent,
          service_detected: classification.service_detected,
          location: classification.location,
          pax: classification.pax,
          shooting_date_text: classification.shooting_date_text,
          shooting_date_suggested: classification.shooting_date_suggested,
          budget_raw: classification.budget_raw,
          extra_requirements: classification.extra_requirements,
          confidence_score: classification.confidence_score,
          classification_reason: classification.classification_reason,
          suggested_template_id: classification.suggested_template_id,
          suggested_comment_text: classification.suggested_comment_text,
          review_status: classification.intent === 'looking_for_service' ? 'pending_review' : 'dismissed',
        });
      }
    }

    // Update group metadata
    const updatedGroup = store.updateGroup(group.id, {
      last_checked_at: new Date().toISOString(),
      next_check_at: new Date(Date.now() + group.check_interval_seconds * 1000).toISOString(),
      status: 'active',
      last_error_message: null,
      can_page_comment: crawlResult.canPageComment ?? group.can_page_comment,
    });

    return NextResponse.json({
      success: true,
      message: `Đã quét thực tế nhóm "${group.name}". Phát hiện ${newCount} bài viết mới trong ${crawlResult.posts.length} bài trên trang.`,
      group: updatedGroup,
      postsFound: crawlResult.posts.length,
      newPostsCount: newCount,
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
