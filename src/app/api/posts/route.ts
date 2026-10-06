import { NextResponse } from 'next/server';
import { postRepo } from '@/lib/repositories/post.repository';
import { groupRepo } from '@/lib/repositories/group.repository';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: Request) {
  // Authentication check: Staff only (admin, marketing, cskh)
  const auth = verifyAuth(req, ['admin', 'marketing', 'cskh']);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const intent = searchParams.get('intent') || undefined;
  const reviewStatus = searchParams.get('review_status') || undefined;
  const groupId = searchParams.get('group_id') || undefined;

  try {
    const posts = await postRepo.getAll({ intent, reviewStatus, groupId });
    return NextResponse.json({ success: true, count: posts.length, data: posts });
  } catch (err: any) {
    if (process.env.NODE_ENV !== 'production') {
      let posts = store.getPosts();
      if (groupId) posts = posts.filter(p => p.group_id === groupId);
      if (intent) posts = posts.filter(p => p.classification?.intent === intent);
      if (reviewStatus) posts = posts.filter(p => p.classification?.review_status === reviewStatus);
      return NextResponse.json({ success: true, count: posts.length, data: posts });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // Authentication check: Admin and Marketing only
    const auth = verifyAuth(req, ['admin', 'marketing']);
    if (!auth.success) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    if (!body.content_raw) {
      return NextResponse.json({ success: false, error: 'Nội dung bài viết là bắt buộc' }, { status: 400 });
    }

    let targetGroupName = 'Nhập thủ công';
    if (body.group_id) {
      const g = await groupRepo.getById(body.group_id);
      if (g) targetGroupName = g.name;
    }

    const { post, isNew } = await postRepo.createIfNew({
      group_id: body.group_id || 'grp-manual',
      group_name: targetGroupName,
      post_url: body.post_url || `https://facebook.com/groups/manual/posts/${Date.now()}`,
      author_name: body.author_name || 'Khách hàng vãng lai',
      content_raw: body.content_raw,
      posted_at: body.posted_at || new Date().toISOString(),
    });

    if (process.env.NODE_ENV !== 'production') {
      store.addPostIfNew({
        group_id: body.group_id || 'grp-manual',
        group_name: targetGroupName,
        post_url: body.post_url || `https://facebook.com/groups/manual/posts/${Date.now()}`,
        author_name: body.author_name || 'Khách hàng vãng lai',
        content_raw: body.content_raw,
        posted_at: body.posted_at || new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      data: post,
      is_new: isNew,
      message: isNew ? 'Đã lưu và phân loại bài viết mới thành công' : 'Bài viết đã tồn tại (chống trùng)',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
