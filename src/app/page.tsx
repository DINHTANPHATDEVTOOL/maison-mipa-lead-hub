'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Radio, 
  MessageSquareCheck, 
  Users, 
  TrendingUp, 
  CheckCircle2, 
  ArrowRight, 
  RefreshCw, 
  Clock, 
  Send,
  ShieldCheck,
  Filter
} from 'lucide-react';
import { FacebookPost, FacebookGroup, CRMLead, WorkerHeartbeat } from '@/types';
import { apiFetch } from '@/lib/api-client';

export default function DashboardPage() {
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [heartbeat, setHeartbeat] = useState<WorkerHeartbeat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simMessage, setSimMessage] = useState<string | null>(null);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [resG, resP, resL, resH] = await Promise.all([
        apiFetch('/api/groups').then(r => r.json()),
        apiFetch('/api/posts').then(r => r.json()),
        apiFetch('/api/leads').then(r => r.json()),
        apiFetch('/api/worker/heartbeat').then(r => r.json())
      ]);

      if (resG.success) setGroups(resG.data);
      if (resP.success) setPosts(resP.data);
      if (resL.success) setLeads(resL.data);
      if (resH.success) setHeartbeat(resH.data);
    } catch (err) {
      console.error('Error loading dashboard data', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSimulateBatch = async () => {
    setIsSimulating(true);
    setSimMessage(null);
    try {
      const res = await apiFetch('/api/worker/simulate?allow_simulation=true', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSimMessage(data.message);
        loadAllData();
      } else {
        setSimMessage(data.error);
      }
    } catch (e: any) {
      setSimMessage('Lỗi khi kích hoạt mô phỏng: ' + e.message);
    } finally {
      setIsSimulating(false);
    }
  };

  const activeGroupsCount = groups.filter(g => g.status === 'active').length;
  const pendingReviewCount = posts.filter(p => p.classification?.review_status === 'pending_review').length;
  const outreachSentCount = posts.filter(p => p.interaction?.status === 'sent_confirmed').length;
  const bookedCount = leads.filter(l => l.stage === 'booked').length;
  const consultingCount = leads.filter(l => l.stage === 'consulting' || l.stage === 'quoted').length;

  return (
    <div className="space-y-5">

      {/* Top Operations Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-[#11141c] border border-zinc-800">
        <div>
          <div className="flex items-center space-x-2 text-xs">
            <span className="font-semibold text-amber-400">TRUNG TÂM VẬN HÀNH</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">Maison MIPA Photography Studio</span>
          </div>
          <h1 className="text-xl font-bold mt-1 tracking-tight text-white">
            Bảng Điều Khiển Theo Dõi Nhóm & Tiếp Cận Khách Hàng
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Quét bài tự động • Bộ lọc nhu cầu theo dịch vụ • Chống trùng lặp tuyệt đối • Bàn giao đường ống CSKH
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleSimulateBatch}
            disabled={isSimulating}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
            <span>Mô Phỏng Quét Thử Nghiệm</span>
          </button>
          
          <button
            onClick={loadAllData}
            title="Làm mới dữ liệu"
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Simulator Notice */}
      {simMessage && (
        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{simMessage}</span>
          </div>
          <button 
            onClick={() => setSimMessage(null)}
            className="text-xs text-zinc-400 hover:text-white px-2 py-0.5 rounded"
          >
            Đóng
          </button>
        </div>
      )}

      {/* 4 Metric Cards - Exact Equal Dimensions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1 */}
        <div className="h-32 p-4 rounded-xl glass-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Nhóm Đang Giám Sát</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">
            {activeGroupsCount} <span className="text-xs font-normal text-zinc-500">/ {groups.length} nhóm</span>
          </div>
          <div className="text-xs text-zinc-400 flex items-center justify-between">
            <span>Chu kỳ: 120s – 180s</span>
            <Link href="/groups" className="text-amber-400 hover:underline flex items-center font-medium">
              Quản lý <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="h-32 p-4 rounded-xl glass-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Bài Cần Duyệt Tiếp Cận</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <MessageSquareCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-amber-400">
            {pendingReviewCount}
          </div>
          <div className="text-xs text-zinc-400 flex items-center justify-between">
            <span>Đã trích xuất nhu cầu</span>
            <Link href="/feed" className="text-amber-400 hover:underline flex items-center font-medium">
              Duyệt ngay <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="h-32 p-4 rounded-xl glass-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Đã Gửi Tiếp Cận</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">
            {outreachSentCount}
          </div>
          <div className="text-xs text-zinc-400 flex items-center justify-between">
            <span>Chống trùng: 1 bài / 1 lần</span>
            <span className="text-emerald-400 font-medium">Khóa an toàn</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="h-32 p-4 rounded-xl glass-card flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Khách Hàng Đang Tư Vấn</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold tracking-tight text-white">
            {consultingCount} <span className="text-xs font-medium text-emerald-400">({bookedCount} đã chốt)</span>
          </div>
          <div className="text-xs text-zinc-400 flex items-center justify-between">
            <span>CSKH tập trung</span>
            <Link href="/crm" className="text-amber-400 hover:underline flex items-center font-medium">
              Vào CRM <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>

      </div>

      {/* Main Grid: Recent Leads & Monitored Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left Column (2 Cols): Bài Viết Mới & Nhu Cầu Phát Hiện */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h2 className="text-sm font-semibold text-white">Nhu Cầu Mới Phát Hiện Gần Đây</h2>
              <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
                {posts.length} bài
              </span>
            </div>
            <Link 
              href="/feed" 
              className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center"
            >
              Xem tất cả ({pendingReviewCount} chờ duyệt) <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>

          <div className="space-y-3">
            {posts.slice(0, 4).map((post) => {
              const cls = post.classification;
              const isLooking = cls?.intent === 'looking_for_service';
              const isContacted = post.interaction?.status === 'sent_confirmed';

              return (
                <div 
                  key={post.id}
                  className="p-4 rounded-xl glass-card space-y-2.5 transition-all"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-white text-sm">{post.author_name}</span>
                      <span className="text-zinc-600">•</span>
                      <span className="text-zinc-400 text-xs">{post.group_name}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {isContacted ? (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                          Đã tiếp cận
                        </span>
                      ) : isLooking ? (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                          Cần dịch vụ ({cls?.confidence_score}%)
                        </span>
                      ) : (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
                          Đã lọc ({cls?.intent})
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed bg-[#0e1118] p-2.5 rounded-lg border border-zinc-800/80">
                    "{post.content_raw}"
                  </p>

                  {cls && isLooking && (
                    <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
                      {cls.service_detected && (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium text-[11px]">
                          {cls.service_detected}
                        </span>
                      )}
                      {cls.location && (
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px]">
                          {cls.location}
                        </span>
                      )}
                      {cls.pax && (
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px]">
                          {cls.pax} người
                        </span>
                      )}
                      {cls.shooting_date_text && (
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px]">
                          {cls.shooting_date_text}
                        </span>
                      )}

                      <div className="ml-auto">
                        <Link
                          href="/feed"
                          className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center"
                        >
                          Xử lý <ArrowRight className="w-3 h-3 ml-0.5" />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column (1 Col): Trạng Thái Các Nhóm Facebook */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Lịch Quét Nhóm Định Kỳ</h2>
            <Link 
              href="/groups" 
              className="text-xs text-amber-400 hover:text-amber-300 font-medium"
            >
              + Thêm nhóm
            </Link>
          </div>

          <div className="space-y-3">
            {groups.slice(0, 3).map((group) => (
              <div 
                key={group.id}
                className="p-3.5 rounded-xl glass-card space-y-2 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-zinc-200 line-clamp-1 text-xs">{group.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium shrink-0">
                    {group.check_interval_seconds}s/lần
                  </span>
                </div>

                <div className="text-zinc-400 flex items-center justify-between text-[11px]">
                  <span>Đã quét: <strong className="text-white">{group.total_posts_found} bài</strong></span>
                  <span>Quyền Page: <strong className={group.can_page_comment ? 'text-emerald-400' : 'text-rose-400'}>{group.can_page_comment ? 'Sẵn sàng' : 'Chưa cấp'}</strong></span>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="truncate">URL: {group.url.replace('https://facebook.com/groups/', '')}</span>
                  <Link href="/groups" className="text-amber-400 hover:underline shrink-0 ml-2 font-medium">
                    Chi tiết
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Verification Protocol Notice */}
          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs space-y-1.5 text-zinc-300">
            <div className="flex items-center space-x-1.5 text-amber-300 font-semibold text-xs">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Nguyên Tắc Kiểm Chứng Hai Lớp</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Tài khoản đọc được nhóm không đồng nghĩa Page có quyền bình luận. Khi không thể tiếp cận bằng Page, hệ thống chuyển sang chế độ hỗ trợ CSKH thủ công để tránh vi phạm chính sách Meta.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
