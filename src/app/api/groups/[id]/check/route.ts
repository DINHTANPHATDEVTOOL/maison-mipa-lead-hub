import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { authManager } from '@/worker/auth';
import { groupCrawler } from '@/worker/crawler';
import { groupRepo } from '@/lib/repositories/group.repository';
import { postRepo } from '@/lib/repositories/post.repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await verifyAuth(req, ['admin', 'marketing']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    // 1. Fetch group from PostgreSQL repository
    const group = await groupRepo.getById(params.id);
    if (!group) {
      return NextResponse.json({ success: false, error: 'Không tìm thấy nhóm trên hệ thống cơ sở dữ liệu.' }, { status: 404 });
    }

    const sessionSummary = authManager.getSessionSummary();
    if (!sessionSummary.exists || !sessionSummary.valid) {
      await groupRepo.updateStatus(group.id, 'needs_auth', 'Chưa có phiên đăng nhập Facebook hợp lệ để quét bài thật.');
      return NextResponse.json({
        success: false,
        needsAuth: true,
        error: 'Chưa có phiên Facebook hợp lệ. Vui lòng nạp session hoặc đăng nhập trước khi quét.',
      }, { status: 400 });
    }

    // 2. Trigger REAL Playwright crawl
    console.log(`[Manual Trigger] Bắt đầu quét thực tế nhóm: ${group.name} (${group.url})`);
    const crawlResult = await groupCrawler.crawlGroup(group.url, group.lookback_hours);

    if (!crawlResult.success) {
      await groupRepo.updateStatus(
        group.id,
        crawlResult.needsAuth ? 'needs_auth' : 'error',
        crawlResult.error || 'Lỗi khi quét nhóm'
      );
      return NextResponse.json({
        success: false,
        error: crawlResult.error || 'Không thể cào dữ liệu từ nhóm Facebook này.',
        needsAuth: crawlResult.needsAuth,
      }, { status: 400 });
    }

    // 3. Ingest & Classify crawled posts into PostgreSQL
    let newCount = 0;

    for (const rawPost of crawlResult.posts) {
      const { isNew } = await postRepo.createIfNew({
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
      }
    }

    // 4. Update group check timestamps and status in PostgreSQL
    const now = new Date();
    const nextCheck = new Date(now.getTime() + (group.check_interval_seconds || 150) * 1000);
    await groupRepo.updateCheckTimestamps(group.id, now, nextCheck, crawlResult.posts.length);
    const updatedGroup = await groupRepo.updateStatus(group.id, 'active');

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
