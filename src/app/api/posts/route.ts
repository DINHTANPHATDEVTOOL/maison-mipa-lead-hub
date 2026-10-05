import { NextResponse } from 'next/server';
import { store } from '@/lib/store';
import { classifyPostContent } from '@/lib/classifier';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const intent = searchParams.get('intent');
  const reviewStatus = searchParams.get('review_status');
  const groupId = searchParams.get('group_id');

  let posts = store.getPosts();

  if (groupId) {
    posts = posts.filter(p => p.group_id === groupId);
  }

  if (intent) {
    posts = posts.filter(p => p.classification?.intent === intent);
  }

  if (reviewStatus) {
    posts = posts.filter(p => p.classification?.review_status === reviewStatus);
  }

  return NextResponse.json({ success: true, count: posts.length, data: posts });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.content_raw) {
      return NextResponse.json({ success: false, error: 'Nội dung bài viết là bắt buộc' }, { status: 400 });
    }

    const groups = store.getGroups();
    const targetGroup = groups.find(g => g.id === body.group_id) || groups[0];

    const { post, isNew } = store.addPostIfNew({
      group_id: targetGroup?.id || 'grp-manual',
      group_name: targetGroup?.name || 'Nhập thủ công',
      post_url: body.post_url || `https://facebook.com/groups/manual/posts/${Date.now()}`,
      author_name: body.author_name || 'Khách hàng vãng lai',
      content_raw: body.content_raw,
    });

    if (isNew) {
      const services = store.getServices();
      const templates = store.getTemplates();
      const classification = classifyPostContent(post.content_raw, services, templates);
      post.classification = {
        id: `cls-${Date.now()}`,
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
      };
    }

    return NextResponse.json({ success: true, isNew, data: post });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
