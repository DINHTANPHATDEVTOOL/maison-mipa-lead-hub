import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { store } from '@/lib/store';
import { getWorkerProcessStatus } from '@/lib/worker-process';
import { heartbeatRepo } from '@/lib/repositories/heartbeat.repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface DispatchedLogItem {
  id: string;
  post_id: string;
  post_url: string;
  author_name: string;
  group_name: string;
  content_raw: string;
  comment_content: string;
  comment_permalink?: string;
  operator_name: string;
  dispatched_at: string;
  confidence_score: number;
  intent: string;
  detected_service?: string;
  is_auto: boolean;
  status: string;
}

export async function GET() {
  try {
    const pool = getDbPool();
    let dispatchedList: DispatchedLogItem[] = [];

    try {
      const res = await pool.query(`
        SELECT 
          o.id as interaction_id,
          o.post_id,
          o.comment_facebook_id,
          o.comment_permalink,
          o.comment_content,
          o.status,
          o.operator_name,
          o.dispatched_at,
          p.post_url,
          p.author_name,
          p.group_name,
          p.content_raw,
          c.confidence_score,
          c.intent,
          c.detected_service
        FROM outreach_interactions o
        JOIN facebook_posts p ON p.id = o.post_id
        LEFT JOIN lead_classifications c ON c.post_id = p.id
        WHERE o.status IN ('sent_confirmed', 'manual_assisted')
        ORDER BY o.dispatched_at DESC
        LIMIT 50
      `);

      if (res.rows.length > 0) {
        dispatchedList = res.rows.map((r: any) => ({
          id: r.interaction_id || `int-${r.post_id}`,
          post_id: r.post_id,
          post_url: r.post_url || '',
          author_name: r.author_name || 'Khách Hàng Facebook',
          group_name: r.group_name || 'Nhóm Facebook',
          content_raw: r.content_raw || '',
          comment_content: r.comment_content || '',
          comment_permalink: r.comment_permalink || '',
          operator_name: r.operator_name || 'Hệ Thống',
          dispatched_at: r.dispatched_at ? new Date(r.dispatched_at).toISOString() : new Date().toISOString(),
          confidence_score: Number(r.confidence_score || 80),
          intent: r.intent || 'looking_for_service',
          detected_service: r.detected_service,
          is_auto: (r.operator_name || '').toLowerCase().includes('tự động') || (r.operator_name || '').toLowerCase().includes('worker'),
          status: r.status,
        }));
      }
    } catch {}

    // Fallback or merge with persistent store
    if (dispatchedList.length === 0) {
      const storePosts = store.getPosts();
      const storeDispatched = storePosts
        .filter(p => p.interaction && (p.interaction.status === 'sent_confirmed' || p.interaction.status === 'manual_assisted'))
        .map(p => ({
          id: p.interaction!.id || `int-${p.id}`,
          post_id: p.id,
          post_url: p.post_url || '',
          author_name: p.author_name || 'Khách Hàng Facebook',
          group_name: p.group_name || 'Nhóm Facebook',
          content_raw: p.content_raw || '',
          comment_content: p.interaction!.comment_content || '',
          comment_permalink: p.interaction!.comment_permalink || '',
          operator_name: p.interaction!.operator_name || 'Hệ Thống',
          dispatched_at: p.interaction!.dispatched_at || new Date().toISOString(),
          confidence_score: Number(p.classification?.confidence_score || 80),
          intent: p.classification?.intent || 'looking_for_service',
          detected_service: p.classification?.service_detected ?? undefined,
          is_auto: (p.interaction!.operator_name || '').toLowerCase().includes('tự động') || (p.interaction!.operator_name || '').toLowerCase().includes('worker'),
          status: p.interaction!.status,
        }))
        .sort((a, b) => new Date(b.dispatched_at).getTime() - new Date(a.dispatched_at).getTime());

      dispatchedList = storeDispatched.slice(0, 50);
    }

    const workerStatus = getWorkerProcessStatus();
    const heartbeat = await heartbeatRepo.getHeartbeat().catch(() => store.getHeartbeat());

    return NextResponse.json({
      success: true,
      data: {
        dispatchedLogs: dispatchedList,
        workerLogs: workerStatus.logs,
        workerRunning: workerStatus.isRunning,
        workerPid: workerStatus.pid,
        operatingMode: heartbeat.operating_mode || 'manual_review',
        minConfidenceScore: heartbeat.min_confidence_score ?? 80,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
