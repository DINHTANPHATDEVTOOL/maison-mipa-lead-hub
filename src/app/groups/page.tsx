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
import { apiFetch } from '@/lib/api-client';

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
      const res = await apiFetch('/api/groups');
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
      const res = await apiFetch('/api/groups', {
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
      const res = await apiFetch(`/api/groups/${groupId}/check`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setNotice(data.message);
        fetchGroups();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setTriggeringId(null);
    }
  };

  return (
    <div className="space-y-5">

      {/* Header Banner - Uniform with Dashboard & CRM */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-[#11141c] border border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Radio className="w-5 h-5 text-amber-500" />
            <span>Quản Lý Nhóm Facebook Giám Sát</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Thiết lập link nhóm Facebook • Chu kỳ quét định kỳ (120s – 180s) • Kiểm tra quyền đọc bài & bình luận Page
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs shadow-sm transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Thêm Nhóm Mới</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-xs text-zinc-400 hover:text-white px-2 py-0.5 rounded">
            Đóng
          </button>
        </div>
      )}

      {/* Groups List - Equal Dimensions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
        {groups.map((group) => {
          const isTriggering = triggeringId === group.id;

          return (
            <div 
              key={group.id} 
              className="p-4 rounded-xl glass-card flex flex-col justify-between space-y-4 hover:border-zinc-700 transition-all h-full"
            >
              {/* Card Header */}
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2 min-h-[44px]">
                  <span className="font-bold text-white text-sm leading-snug line-clamp-2">{group.name}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/20 shrink-0">
                    {group.check_interval_seconds}s/lần
                  </span>
                </div>

                <a 
                  href={group.url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center space-x-1 truncate"
                >
                  <span className="truncate">{group.url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0 ml-1" />
                </a>
              </div>

              {/* Status & Stats Box - Uniform Heights & Padding */}
              <div className="p-3 rounded-lg bg-[#0e1118] border border-zinc-800 space-y-2 text-xs">
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

                <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1.5 border-t border-zinc-800">
                  <span>Lần kiểm tra cuối:</span>
                  <span className="text-zinc-300">{group.last_checked_at ? new Date(group.last_checked_at).toLocaleTimeString('vi-VN') : 'Chưa quét'}</span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Lần quét kế tiếp:</span>
                  <span className="text-amber-300 font-medium">{group.next_check_at ? new Date(group.next_check_at).toLocaleTimeString('vi-VN') : 'Theo lịch'}</span>
                </div>
              </div>

              {/* Actions - Uniform Height */}
              <div className="pt-2 border-t border-zinc-800">
                <button
                  onClick={() => handleTriggerCheck(group.id, group.name)}
                  disabled={isTriggering}
                  className="w-full h-9 flex items-center justify-center space-x-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12151e] border border-zinc-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-bold text-white">Thêm Nhóm Facebook Mới</h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddGroup} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-zinc-300 mb-1">
                  Tên Nhóm / Mô Tả
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Hội Chụp Ảnh Áo Dài Sài Gòn"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-medium text-zinc-300 mb-1">
                  Link Nhóm Facebook (URL)
                </label>
                <input
                  type="text"
                  required
                  placeholder="https://facebook.com/groups/... hoặc https://web.facebook.com/share/g/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500 font-mono"
                />
                <p className="text-[10px] text-zinc-400 mt-1">
                  Hỗ trợ cả link /groups/ và link chia sẻ mới /share/g/ (tự động xóa tracking mibextid, _rdc, _rdr).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-zinc-300 mb-1">
                    Chu Kỳ Quét Mục Tiêu
                  </label>
                  <select
                    value={intervalSecs}
                    onChange={(e) => setIntervalSecs(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="120">120 giây (Nhanh)</option>
                    <option value="150">150 giây (Đề xuất)</option>
                    <option value="180">180 giây (An toàn)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-zinc-300 mb-1">
                    Phạm Vi Lấy Bài Lần Đầu
                  </label>
                  <select
                    value={lookbackHours}
                    onChange={(e) => setLookbackHours(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  >
                    <option value="12">12 giờ gần nhất</option>
                    <option value="24">24 giờ gần nhất</option>
                    <option value="48">48 giờ gần nhất</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-500/20 text-xs text-zinc-400 space-y-1">
                <span className="font-semibold text-amber-300">Lưu ý kiểm tra quyền:</span>
                <p className="text-[11px] leading-relaxed">
                  Tài khoản giám sát đọc được bài không đồng nghĩa Page Maison MIPA được bình luận. Nếu Page chưa đủ điều kiện, bài vẫn được lưu nhưng hệ thống sẽ đánh dấu không thể tiếp cận tự động bằng Page.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-sm transition-colors"
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
