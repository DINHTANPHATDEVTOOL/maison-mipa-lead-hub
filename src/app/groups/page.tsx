'use client';

import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Plus, 
  RefreshCw, 
  ExternalLink, 
  ShieldCheck, 
  AlertTriangle, 
  Clock, 
  Play, 
  CheckCircle2, 
  X,
  Trash2
} from 'lucide-react';
import { FacebookGroup } from '@/types';

export default function GroupsPage() {
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [intervalSecs, setIntervalSecs] = useState('150');
  const [lookbackHours, setLookbackHours] = useState('24');

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/groups');
      const data = await res.json();
      if (data.success) {
        setGroups(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url) return;

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          url,
          check_interval_seconds: parseInt(intervalSecs, 10),
          lookback_hours: parseInt(lookbackHours, 10),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setName('');
        setUrl('');
        setNotice(`Đã thêm nhóm "${data.data.name}" vào danh sách giám sát.`);
        fetchGroups();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleTriggerCheck = async (groupId: string, groupName: string) => {
    setTriggeringId(groupId);
    setNotice(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/check`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setNotice(data.message);
        fetchGroups();
      }
    } catch (e: any) {
      alert('Lỗi kích hoạt: ' + e.message);
    } finally {
      setTriggeringId(null);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Radio className="w-6 h-6 text-brand-400" />
            <span>Quản Lý Nhóm Facebook Giám Sát</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Thiết lập link nhóm, chu kỳ quét định kỳ (120s – 180s), và kiểm chứng quyền đọc bài / quyền bình luận Page.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-medium text-sm shadow-lg shadow-brand-500/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Nhóm Mới</span>
        </button>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-amber-200 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-xs text-zinc-400 hover:text-white">
            Đóng
          </button>
        </div>
      )}

      {/* Groups List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {groups.map((group) => {
          const isTriggering = triggeringId === group.id;

          return (
            <div 
              key={group.id} 
              className="p-5 rounded-2xl glass-card border border-white/5 flex flex-col justify-between space-y-4 hover:border-brand-500/30 transition-all"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold text-white text-base leading-snug">{group.name}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-300 font-semibold border border-brand-500/20 shrink-0">
                    {group.check_interval_seconds}s/lần
                  </span>
                </div>

                <a 
                  href={group.url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs text-amber-400/80 hover:text-amber-300 flex items-center space-x-1 truncate"
                >
                  <span className="truncate">{group.url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 ml-1" />
                </a>
              </div>

              {/* Status & Stats */}
              <div className="p-3 rounded-xl bg-zinc-900/60 border border-white/5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Trạng thái theo dõi:</span>
                  <span className={`font-semibold ${group.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {group.status === 'active' ? '● Đang chạy liên tục' : '● Cần xác thực / Lỗi'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Quyền bình luận Page:</span>
                  <span className={`font-semibold ${group.can_page_comment ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {group.can_page_comment ? 'Đã cho phép' : 'Chưa được cấp'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Tổng bài đã tìm thấy:</span>
                  <span className="font-bold text-white">{group.total_posts_found} bài</span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-white/5">
                  <span>Lần kiểm tra cuối:</span>
                  <span>{group.last_checked_at ? new Date(group.last_checked_at).toLocaleTimeString('vi-VN') : 'Chưa quét'}</span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Lần quét kế tiếp:</span>
                  <span className="text-amber-300">{group.next_check_at ? new Date(group.next_check_at).toLocaleTimeString('vi-VN') : 'Theo lịch'}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 pt-2 border-t border-white/5">
                <button
                  onClick={() => handleTriggerCheck(group.id, group.name)}
                  disabled={isTriggering}
                  className="flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isTriggering ? 'animate-spin' : ''}`} />
                  <span>{isTriggering ? 'Đang kiểm tra...' : 'Quét Ngay Lập Tức'}</span>
                </button>
              </div>

            </div>
          );
        })}
      </div>

      {/* Modal Add Group */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#151923] border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">Thêm Nhóm Facebook Mới</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Tên Nhóm / Mô Tả
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Hội Chụp Ảnh Áo Dài Sài Gòn"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-sm focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Link Nhóm Facebook (URL)
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://facebook.com/groups/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-sm focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Chu Kỳ Quét Mục Tiêu
                  </label>
                  <select
                    value={intervalSecs}
                    onChange={(e) => setIntervalSecs(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-sm focus:outline-none focus:border-brand-500"
                  >
                    <option value="120">120 giây (Nhanh)</option>
                    <option value="150">150 giây (Đề xuất)</option>
                    <option value="180">180 giây (An toàn)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Phạm Vi Lấy Bài Lần Đầu
                  </label>
                  <select
                    value={lookbackHours}
                    onChange={(e) => setLookbackHours(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-sm focus:outline-none focus:border-brand-500"
                  >
                    <option value="12">12 giờ gần nhất</option>
                    <option value="24">24 giờ gần nhất</option>
                    <option value="48">48 giờ gần nhất</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-brand-950/40 border border-brand-500/20 text-xs text-zinc-400 space-y-1">
                <span className="font-semibold text-amber-300">Lưu ý kiểm tra quyền:</span>
                <p>
                  Hệ thống kiểm tra riêng biệt: Tài khoản theo dõi đọc được bài không đồng nghĩa Page Maison MIPA được bình luận. Nếu Page chưa đủ điều kiện, bài vẫn được lưu nhưng hệ thống sẽ đánh dấu không thể tiếp cận bằng Page.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium shadow-md transition-all"
                >
                  Xác Nhận Thêm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
