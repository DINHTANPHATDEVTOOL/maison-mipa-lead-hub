import { NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { groupRepo } from '@/lib/repositories/group.repository';
import { store } from '@/lib/store';
import { groupCrawlService } from '@/lib/services/group-crawl.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(req: Request) {
  try {
    const auth = await verifyAuth(req, ['admin', 'marketing', 'cskh']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    let targetGroupIds: string[] = [];

    if (body.groupIds === 'all' || !body.groupIds) {
      const groups = await groupRepo.getAll().catch(() => store.getGroups());
      targetGroupIds = groups.filter(g => g.status === 'active').map(g => g.id);
    } else if (Array.isArray(body.groupIds)) {
      targetGroupIds = body.groupIds;
    } else if (typeof body.groupIds === 'string') {
      targetGroupIds = [body.groupIds];
    }

    if (targetGroupIds.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Chưa có nhóm nào được chọn để quét. Vui lòng chọn ít nhất 1 nhóm Facebook.' 
      }, { status: 400 });
    }

    const lookbackHours = Number(body.lookbackHours) || 24;
    const profileId = body.profileId === 'auto' ? undefined : body.profileId;
    const autoDispatch = Boolean(body.autoDispatch);

    console.log(`[API /api/groups/scan] Bắt đầu quét ${targetGroupIds.length} nhóm. Profile: ${profileId || 'Mặc định'}`);

    const scanResult = await groupCrawlService.scanMultipleGroups({
      groupIds: targetGroupIds,
      lookbackHours,
      profileId,
      autoDispatch,
    });

    return NextResponse.json({
      success: scanResult.success,
      data: scanResult,
      message: scanResult.success
        ? `Đã quét xong ${scanResult.scannedCount} nhóm! Tìm thấy ${scanResult.totalPostsFound} bài viết (${scanResult.totalNewPosts} bài mới).`
        : `Không thể quét nhóm: ${scanResult.results[0]?.error || 'Lỗi không xác định'}`,
    });

  } catch (err: any) {
    console.error('[API /api/groups/scan Error]', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
