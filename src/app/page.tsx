'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Radio, 
  MessageSquareCheck, 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight, 
  Play, 
  ShieldAlert, 
  Sparkles,
  RefreshCw,
  Clock,
  Send
} from 'lucide-react';
import { FacebookPost, FacebookGroup, CRMLead, WorkerHeartbeat } from '@/types';

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
        fetch('/api/groups').then(r => r.json()),
        fetch('/api/posts').then(r => r.json()),
        fetch('/api/leads').then(r => r.json()),
        fetch('/api/worker/heartbeat').then(r => r.json())
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
      const res = await fetch('/api/worker/simulate', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSimMessage(data.message);
        loadAllData();
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
    <div className="space-y-6">

      {/* Top Welcome & Worker Status Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl glass-panel border border-brand-500/20 shadow-xl">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-300 font-semibold border border-brand-500/20">
              TRUNG TÂM ĐIỀU HÀNH TỰ ĐỘNG
            </span>
            <span className="text-zinc-500">•</span>
            <span className="text-xs text-zinc-400">Maison MIPA Photography Studio</span>
          </div>
          <h1 className="text-2xl font-bold mt-1 tracking-tight text-white">
            Tổng Quan Theo Dõi & Tiếp Cận Khách Hàng
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Quét bài viết theo chu kỳ • Nhận dạng nhu cầu bằng AI & Quy tắc • Chống trùng lặp tuyệt đối • Bàn giao CSKH
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSimulateBatch}
            disabled={isSimulating}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-amber-600 hover:from-brand-500 hover:to-amber-500 text-white font-medium text-sm shadow-lg shadow-brand-500/25 transition-all disabled:opacity-50"
          >
            {isSimulating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>Mô Phỏng Quét Nhóm (Test Flow)</span>
          </button>
          
          <button
            onClick={loadAllData}
            title="Làm mới dữ liệu"
            className="p-2.5 rounded-xl glass-card text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Simulator Notification Banner */}
      {simMessage && (
        <div className="p-3.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-amber-200 text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
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

      {/* Central Worker Status Bar */}
      <div className="p-4 rounded-xl glass-card flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className={`w-2.5 h-2.5 rounded-full ${heartbeat?.is_alive ? 'bg-emerald-400' : 'bg-rose-500'}`} />
            <span className="font-semibold text-zinc-200">
              Bộ chạy nền (Central Worker): {heartbeat?.is_alive ? 'Đang hoạt động trên Ubuntu' : 'Đã dừng / Mất kết nối'}
            </span>
          </div>
          <span className="text-zinc-600">|</span>
          <div className="text-zinc-400">
            Chế độ: <strong className="text-amber-300">{heartbeat?.operating_mode === 'auto_dispatch' ? 'Tự Động Đăng' : 'Duyệt Thủ Công (Marketing)'}</strong>
          </div>
          <span className="text-zinc-600">|</span>
          <div className="text-zinc-400">
            Phiên Facebook: <strong className={heartbeat?.facebook_auth_valid ? 'text-emerald-400' : 'text-amber-400'}>
              {heartbeat?.facebook_auth_valid ? 'Hợp lệ & Sẵn sàng' : 'Cần kiểm tra'}
            </strong>
          </div>
        </div>

        <div className="text-zinc-400 flex items-center space-x-1">
          <Clock className="w-3.5 h-3.5 text-zinc-500" />
          <span>Nhịp tim cuối: {heartbeat?.last_ping ? new Date(heartbeat.last_ping).toLocaleTimeString('vi-VN') : 'Vừa xong'}</span>
        </div>
      </div>

      {/* 4 Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1 */}
        <div className="p-5 rounded-2xl glass-card border border-white/5 relative overflow-hidden group hover:border-brand-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Nhóm Đang Giám Sát</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {activeGroupsCount} <span className="text-sm font-normal text-zinc-500">/ {groups.length} nhóm</span>
          </div>
          <div className="text-xs text-zinc-400 mt-2 flex items-center justify-between">
            <span>Chu kỳ: 120s – 180s/nhóm</span>
            <Link href="/groups" className="text-amber-400 hover:underline flex items-center">
              Quản lý <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="p-5 rounded-2xl glass-card border border-white/5 relative overflow-hidden group hover:border-brand-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Bài Cần Duyệt Tiếp Cận</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <MessageSquareCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-amber-400 mt-2">
            {pendingReviewCount}
          </div>
          <div className="text-xs text-zinc-400 mt-2 flex items-center justify-between">
            <span>Đã trích xuất nhu cầu bằng AI</span>
            <Link href="/feed" className="text-amber-400 hover:underline flex items-center">
              Duyệt ngay <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="p-5 rounded-2xl glass-card border border-white/5 relative overflow-hidden group hover:border-brand-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Đã Bình Luận Tiếp Cận</span>
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {outreachSentCount}
          </div>
          <div className="text-xs text-zinc-400 mt-2 flex items-center justify-between">
            <span>Chống trùng: 1 bài / 1 lần</span>
            <span className="text-emerald-400">100% Khóa bảo vệ</span>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="p-5 rounded-2xl glass-card border border-white/5 relative overflow-hidden group hover:border-brand-500/30 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Khách Đang Tư Vấn & Đặt Lịch</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-white mt-2">
            {consultingCount} <span className="text-sm font-semibold text-emerald-400">({bookedCount} đã chốt)</span>
          </div>
          <div className="text-xs text-zinc-400 mt-2 flex items-center justify-between">
            <span>CSKH chăm sóc tập trung</span>
            <Link href="/crm" className="text-amber-400 hover:underline flex items-center">
              Vào CRM <ArrowRight className="w-3 h-3 ml-0.5" />
            </Link>
          </div>
        </div>

      </div>

      {/* Main Grid: Pending Leads & Active Monitoring Groups */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 Cols): Bài Viết Mới & Nhu Cầu Phát Hiện */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white">Nhu Cầu Mới Phát Hiện Gần Đây</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                {posts.length} bài
              </span>
            </div>
            <Link 
              href="/feed" 
              className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center"
            >
              Xem toàn bộ hàng chờ ({pendingReviewCount} cần duyệt) <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Link>
          </div>

          <div className="space-y-3">
            {posts.slice(0, 4).map((post) => {
              const cls = post.classification;
              const isLooking = cls?.intent === 'looking_for_service';
              const isSelling = cls?.intent === 'selling';
              const isRecruiting = cls?.intent === 'recruiting';
              const isContacted = post.interaction?.status === 'sent_confirmed';

              return (
                <div 
                  key={post.id}
                  className="p-4 rounded-xl glass-card border border-white/5 hover:border-brand-500/30 transition-all space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-zinc-200 text-sm">{post.author_name}</span>
                      <span className="text-zinc-600">•</span>
                      <span className="text-xs text-zinc-400">{post.group_name}</span>
                    </div>

                    <div className="flex items-center space-x-2">
                      {isLooking && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-medium">
                          Nhu cầu: {cls.service_detected || 'Tìm chụp ảnh'}
                        </span>
                      )}
                      {isSelling && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/20 font-medium">
                          Rao bán máy (Đã loại)
                        </span>
                      )}
                      {isRecruiting && (
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
                          Tuyển dụng
                        </span>
                      )}
                      {isContacted && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 font-medium">
                          Đã tiếp cận
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-zinc-300 line-clamp-2 italic">
                    "{post.content_raw}"
                  </p>

                  {isLooking && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5 text-xs text-zinc-400">
                      {cls.location && (
                        <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300">
                          📍 {cls.location}
                        </span>
                      )}
                      {cls.pax && (
                        <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300">
                          👥 {cls.pax} người
                        </span>
                      )}
                      {cls.shooting_date_text && (
                        <span className="px-2 py-0.5 rounded bg-zinc-800/80 text-zinc-300">
                          📅 {cls.shooting_date_text}
                        </span>
                      )}
                      {cls.extra_requirements?.map((req, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-brand-500/15 text-brand-300 border border-brand-500/20">
                          ✨ {req}
                        </span>
                      ))}

                      <div className="ml-auto">
                        <Link
                          href="/feed"
                          className="text-xs text-amber-400 hover:text-amber-300 font-medium flex items-center"
                        >
                          Xử lý bài này <ArrowRight className="w-3 h-3 ml-0.5" />
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
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Lịch Quét Nhóm Định Kỳ</h2>
            <Link 
              href="/groups" 
              className="text-xs text-amber-400 hover:text-amber-300 font-medium"
            >
              + Thêm nhóm
            </Link>
          </div>

          <div className="space-y-3">
            {groups.map((group) => {
              return (
                <div 
                  key={group.id}
                  className="p-4 rounded-xl glass-card border border-white/5 space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-semibold text-zinc-200 text-sm line-clamp-1">{group.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {group.check_interval_seconds}s/lần
                    </span>
                  </div>

                  <div className="text-xs text-zinc-400 flex items-center justify-between">
                    <span>Đã quét: <strong className="text-white">{group.total_posts_found} bài</strong></span>
                    <span>Quyền Page: <strong className={group.can_page_comment ? 'text-emerald-400' : 'text-rose-400'}>{group.can_page_comment ? 'Sẵn sàng' : 'Chưa cấp'}</strong></span>
                  </div>

                  <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-400">
                    <span className="truncate">URL: {group.url.replace('https://facebook.com/groups/', '')}</span>
                    <Link href="/groups" className="text-amber-400 hover:underline shrink-0 ml-2">
                      Chi tiết
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Verification Protocol Notice */}
          <div className="p-4 rounded-xl bg-brand-950/40 border border-brand-500/30 text-xs space-y-2 text-zinc-300">
            <div className="flex items-center space-x-2 text-amber-300 font-semibold">
              <ShieldAlert className="w-4 h-4" />
              <span>Nguyên Tắc Kiểm Chứng An Toàn</span>
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Maison MIPA thực thi kiểm tra hai lớp: Đọc được nhóm không đồng nghĩa Page có quyền bình luận. Khi không thể tiếp cận bằng Page, hệ thống chuyển sang chế độ hỗ trợ CSKH thủ công.
            </p>
          </div>
        </div>

      </div>

    </div>
  );
}
