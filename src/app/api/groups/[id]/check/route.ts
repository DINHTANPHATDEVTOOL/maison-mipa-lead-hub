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

    // 2. Set next_check_at to NOW so periodic scheduler also treats it as immediately due
    await groupRepo.updateCheckTimestamps(group.id, group.last_checked_at || undefined, new Date().toISOString()).catch(() => {});

    // 3. Enqueue persistent crawl job for Background Worker
    const { jobRepo } = await import('@/lib/repositories/job.repository');
    const job = await jobRepo.createJob({
      id: `crawl_${group.id}`,
      job_type: 'crawl_group',
      target_id: group.id,
      payload: {
        lookback_hours: group.lookback_hours,
        manual_trigger: true,
      },
    });

    // 4. Check if worker is running; auto-start if not
    const { isWorkerRunning, startWorkerProcess } = await import('@/lib/worker-process');
    let workerNotice = '';
    if (!isWorkerRunning()) {
      const startRes = startWorkerProcess();
      if (startRes.success) {
        workerNotice = ' (Đã tự động khởi chạy Worker nền)';
      }
    }

    return NextResponse.json({
      success: true,
      message: `Đã đưa nhóm "${group.name}" vào quét ngay lập tức.${workerNotice}`,
      job_id: job.id,
      status: 'queued',
    });



  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
