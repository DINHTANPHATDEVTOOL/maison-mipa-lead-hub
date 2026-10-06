'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Radio, 
  MessageSquareCheck, 
  Users, 
  CheckCircle2, 
  RefreshCw, 
  Send, 
  ExternalLink,
  Plus,
  Key,
  Download,
  Edit3,
  Sparkles,
  Check,
  Cpu
} from 'lucide-react';
import { FacebookPost, FacebookGroup, CRMLead, CRMStage, WorkerHeartbeat } from '@/types';
import { apiFetch } from '@/lib/api-client';

const CRM_STAGES: { key: CRMStage; label: string; color: string; bg: string }[] = [
  { key: 'uncontacted', label: 'Chờ phản hồi', color: 'text-zinc-400', bg: 'bg-zinc-800' },
  { key: 'replied', label: 'Có phản hồi', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { key: 'consulting', label: 'Đang tư vấn', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  { key: 'quoted', label: 'Đã báo giá', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { key: 'booked', label: 'Đã chốt lịch', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  { key: 'lost', label: 'Hủy / Chưa chốt', color: 'text-rose-400', bg: 'bg-rose-500/20' },
];

export default function AllInOneDashboard() {
  // Main Data States
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [heartbeat, setHeartbeat] = useState<WorkerHeartbeat | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Active Workspace Tab
  const [activeTab, setActiveTab] = useState<'feed' | 'crm' | 'groups'>('feed');

  // Quick Action States
  const [quickPostUrl, setQuickPostUrl] = useState('');
  const [quickPostContent, setQuickPostContent] = useState('');
  const [quickPostAuthor, setQuickPostAuthor] = useState('');
  const [quickPostGroupId, setQuickPostGroupId] = useState('');
  const [isImportingPost, setIsImportingPost] = useState(false);
  const [isCrawlingGroup, setIsCrawlingGroup] = useState(false);
  const [selectedCrawlGroupId, setSelectedCrawlGroupId] = useState('');

  // Dispatch & Comment States
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [editedComments, setEditedComments] = useState<Record<string, string>>({});
  const [feedFilter, setFeedFilter] = useState<'looking' | 'pending' | 'commented' | 'all'>('looking');
  const [notice, setNotice] = useState<string | null>(null);

  // Facebook Login Modal
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [rawStorageStateJson, setRawStorageStateJson] = useState('');
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isLaunchingBrowser, setIsLaunchingBrowser] = useState(false);

  // CRM Fast Update
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  // New Group Form
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupUrl, setNewGroupUrl] = useState('');
  const [newGroupCanPage, setNewGroupCanPage] = useState(true);
  const [isAddingGroup, setIsAddingGroup] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [resG, resP, resL, resH, resAuth] = await Promise.all([
        apiFetch('/api/groups').then(r => r.json()).catch(() => ({ success: false })),
        apiFetch('/api/posts').then(r => r.json()).catch(() => ({ success: false })),
        apiFetch('/api/leads').then(r => r.json()).catch(() => ({ success: false })),
        apiFetch('/api/worker/heartbeat').then(r => r.json()).catch(() => ({ success: false })),
        apiFetch('/api/worker/auth').then(r => r.json()).catch(() => ({ success: false }))
      ]);

      if (resG.success) setGroups(resG.data || []);
      if (resP.success) setPosts(resP.data || []);
      if (resL.success) setLeads(resL.data || []);
      if (resH.success) setHeartbeat(resH.data || null);
      if (resAuth.success) setSessionInfo(resAuth.data || null);
    } catch (err) {
      console.error('Lỗi nạp dữ liệu trung tâm:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 1. Quét hoặc Nhập nhanh bài viết Facebook
  const handleQuickImportPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPostUrl.trim() && !quickPostContent.trim()) {
      alert('Vui lòng nhập Link bài viết Facebook hoặc nội dung bài cần phân tích!');
      return;
    }

    setIsImportingPost(true);
    try {
      const res = await apiFetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_url: quickPostUrl.trim() || undefined,
          content_raw: quickPostContent.trim() || 'Khách hỏi dịch vụ chụp ảnh trên Facebook',
          author_name: quickPostAuthor.trim() || 'Khách hàng Facebook',
          group_id: quickPostGroupId.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNotice(`Đã thêm và phân loại nhu cầu bài viết thành công: ${data.data?.classification?.intent === 'looking_for_service' ? 'Cần Chụp Ảnh' : 'Khác'}`);
        setQuickPostUrl('');
        setQuickPostContent('');
        setQuickPostAuthor('');
        loadAllData();
      } else {
        alert('Lỗi thêm bài: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setIsImportingPost(false);
    }
  };

  // 2. Kích hoạt quét bài nhóm ngay
  const handleTriggerCrawlGroup = async () => {
    if (!selectedCrawlGroupId) {
      alert('Vui lòng chọn nhóm Facebook cần quét!');
      return;
    }

    setIsCrawlingGroup(true);
    try {
      const res = await apiFetch(`/api/groups/${selectedCrawlGroupId}/check`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Đã lên lịch quét nhóm "${data.data?.group_name || 'Facebook'}". Worker đang xử lý ngầm.`);
        loadAllData();
      } else {
        alert('Không thể quét: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi quét nhóm: ' + err.message);
    } finally {
      setIsCrawlingGroup(false);
    }
  };

  // 3. Duyệt & Gửi bình luận tiếp cận (One-Click Dispatch)
  const handleDispatchComment = async (post: FacebookPost, isManual = false) => {
    if (dispatchingId) return;

    const textToSend = editedComments[post.id] !== undefined
      ? editedComments[post.id]
      : (post.classification?.suggested_comment_text || '');

    if (!isManual && !textToSend.trim()) {
      alert('Nội dung bình luận không được để trống!');
      return;
    }

    setDispatchingId(post.id);
    setNotice(null);

    try {
      const res = await apiFetch(`/api/posts/${post.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment_content: textToSend.trim(),
          operator_name: 'Quản trị viên Maison MIPA',
          is_manual_assisted: isManual,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNotice(`Đã tiếp cận thành công bài viết của "${post.author_name}" và tự động đưa vào danh sách CRM!`);
        loadAllData();
      } else {
        if (data.needsAuth) {
          setIsLoginModalOpen(true);
          alert('Chưa có phiên đăng nhập Facebook! Hãy nhấn nút "Đăng Nhập Facebook Ngay" để kết nối tài khoản.');
        } else {
          alert('Lỗi gửi bình luận: ' + data.error);
        }
      }
    } catch (err: any) {
      alert('Lỗi thực thi: ' + err.message);
    } finally {
      setDispatchingId(null);
    }
  };

  // 4. Cập nhật nhanh trạng thái CRM
  const handleUpdateLeadStage = async (leadId: string, newStage: CRMStage) => {
    setUpdatingLeadId(leadId);
    try {
      const res = await apiFetch(`/api/leads`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: leadId,
          stage: newStage,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Đã cập nhật trạng thái khách hàng sang "${CRM_STAGES.find(s => s.key === newStage)?.label}".`);
        loadAllData();
      }
    } catch (err: any) {
      alert('Lỗi cập nhật CRM: ' + err.message);
    } finally {
      setUpdatingLeadId(null);
    }
  };

  // 5. Xuất CSV danh sách khách hàng
  const handleExportCsv = async () => {
    setIsExportingCsv(true);
    try {
      const res = await apiFetch('/api/leads/export');
      if (!res.ok) throw new Error('Xuất CSV thất bại');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maison_mipa_leads_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setNotice('Đã tải xuống file CSV danh sách khách hàng.');
    } catch (err: any) {
      alert('Lỗi xuất file: ' + err.message);
    } finally {
      setIsExportingCsv(false);
    }
  };

  // 6. Xử lý Đăng nhập Facebook
  const handleLaunchBrowserLogin = async () => {
    setIsLaunchingBrowser(true);
    try {
      const res = await apiFetch('/api/worker/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'launch_browser_login' }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setIsLaunchingBrowser(false);
    }
  };

  const handleSaveStorageStateJson = async () => {
    if (!rawStorageStateJson.trim()) {
      alert('Vui lòng dán dữ liệu JSON storageState!');
      return;
    }
    setIsSavingSession(true);
    try {
      const res = await apiFetch('/api/worker/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_session',
          storageStateJson: rawStorageStateJson.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Lưu phiên thành công! Đã kích hoạt bảo mật AES-256-GCM.');
        setIsLoginModalOpen(false);
        setRawStorageStateJson('');
        loadAllData();
      } else {
        alert('Lỗi lưu phiên: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setIsSavingSession(false);
    }
  };

  const handleDeleteSession = async () => {
    if (!confirm('Bạn có chắc chắn muốn đăng xuất tài khoản Facebook hiện tại?')) return;
    try {
      const res = await apiFetch('/api/worker/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_session' }),
      });
      const data = await res.json();
      if (data.success) {
        alert('Đã xóa phiên đăng nhập Facebook.');
        loadAllData();
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  // 7. Thêm nhóm mới
  const handleAddNewGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !newGroupUrl.trim()) {
      alert('Vui lòng nhập tên nhóm và đường dẫn Facebook nhóm!');
      return;
    }
    setIsAddingGroup(true);
    try {
      const res = await apiFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          url: newGroupUrl.trim(),
          can_page_comment: newGroupCanPage,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Đã thêm nhóm "${newGroupName}" vào danh sách theo dõi.`);
        setNewGroupName('');
        setNewGroupUrl('');
        loadAllData();
      } else {
        alert('Lỗi thêm nhóm: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setIsAddingGroup(false);
    }
  };

  // Metrics calculation
  const activeGroupsCount = groups.filter(g => g.status === 'active').length;
  const pendingReviewCount = posts.filter(p => p.classification?.review_status === 'pending_review').length;
  const outreachSentCount = posts.filter(p => p.interaction?.status === 'sent_confirmed').length;
  const bookedCount = leads.filter(l => l.stage === 'booked').length;

  // Filtered posts
  const filteredPosts = posts.filter(p => {
    if (feedFilter === 'looking') return p.classification?.intent === 'looking_for_service' && p.interaction?.status !== 'sent_confirmed';
    if (feedFilter === 'pending') return p.classification?.review_status === 'pending_review';
    if (feedFilter === 'commented') return p.interaction?.status === 'sent_confirmed';
    return true;
  });

  return (
    <div className="space-y-5 pb-16">

      {/* =========================================================================
          1. HEADER ĐIỀU HÀNH & KẾT NỐI TỔNG HỢP (TOP MASTER CONTROL BAR)
      ========================================================================== */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-[#11141c] via-[#151924] to-[#11141c] border border-zinc-800 shadow-xl space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                ALL-IN-ONE WORKSPACE
              </span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-300 font-medium">Trung Tâm Điều Hành Toàn Diện Maison MIPA</span>
            </div>
            <h1 className="text-2xl font-extrabold mt-1 text-white tracking-tight flex items-center space-x-2">
              <span>Bàn Làm Việc Tiếp Cận & Khách Hàng Tập Trung</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Kết nối Facebook • Quét bài tự động • Duyệt & Gửi 1-Click • Quản lý đường ống CSKH trực tiếp trên 1 trang duy nhất
            </p>
          </div>

          {/* Quick Actions & Statuses */}
          <div className="flex flex-wrap items-center gap-2.5">

            {/* Facebook Status Badge */}
            {sessionInfo?.valid ? (
              <div className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold">FB: Đã Đăng Nhập {sessionInfo.userId ? `(${sessionInfo.userId})` : ''}</span>
                <button
                  onClick={handleDeleteSession}
                  title="Đăng xuất / Xóa phiên"
                  className="ml-1 text-[11px] text-zinc-400 hover:text-rose-400 underline"
                >
                  Đổi nick
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsLoginModalOpen(true)}
                className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-lg transition-all animate-pulse"
              >
                <Key className="w-4 h-4" />
                <span>Đăng Nhập Facebook Ngay</span>
              </button>
            )}

            {/* Worker Status Badge */}
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-xl border text-xs ${
              heartbeat?.is_alive 
                ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-300' 
                : 'bg-zinc-800/60 border-zinc-700 text-zinc-400'
            }`}>
              <Cpu className="w-4 h-4 shrink-0" />
              <span>{heartbeat?.is_alive ? 'Worker Đang Chạy' : 'Worker Nghỉ (Khởi động: npm run worker)'}</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={loadAllData}
              title="Làm mới toàn bộ dữ liệu"
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Thông báo thao tác */}
        {notice && (
          <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{notice}</span>
            </div>
            <button onClick={() => setNotice(null)} className="text-zinc-400 hover:text-white text-xs">✕</button>
          </div>
        )}

        {/* =========================================================================
            2. THANH THAO TÁC NHANH (QUICK POST IMPORT & CRAWL BAR)
        ========================================================================== */}
        <div className="p-3.5 rounded-xl bg-[#0d1017] border border-zinc-800/80">
          <form onSubmit={handleQuickImportPost} className="flex flex-col md:flex-row items-center gap-3">
            <div className="flex items-center space-x-2 shrink-0 text-xs font-bold text-amber-400">
              <Sparkles className="w-4 h-4" />
              <span>NHẬP NHANH BÀI FACEBOOK:</span>
            </div>

            <input
              type="text"
              placeholder="Dán link bài viết Facebook (VD: https://facebook.com/groups/.../posts/...)"
              value={quickPostUrl}
              onChange={(e) => setQuickPostUrl(e.target.value)}
              className="flex-1 w-full bg-[#161a24] border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />

            <input
              type="text"
              placeholder="Nội dung tóm tắt khách hỏi (tùy chọn)"
              value={quickPostContent}
              onChange={(e) => setQuickPostContent(e.target.value)}
              className="w-full md:w-56 bg-[#161a24] border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            />

            <select
              value={quickPostGroupId}
              onChange={(e) => setQuickPostGroupId(e.target.value)}
              className="w-full md:w-44 bg-[#161a24] border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-amber-500"
            >
              <option value="">(Chọn nhóm hoặc Tự do)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>

            <button
              type="submit"
              disabled={isImportingPost}
              className="w-full md:w-auto px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs shrink-0 transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isImportingPost ? 'Đang thêm...' : 'Phân Tích & Thêm Bài'}</span>
            </button>
          </form>
        </div>

      </div>

      {/* =========================================================================
          3. CÁC THẺ CHỈ SỐ NHANH (KEY METRICS CARDS)
      ========================================================================== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-400">Nhóm Đang Giám Sát</div>
            <div className="text-xl font-bold text-white mt-0.5">{activeGroupsCount} <span className="text-xs text-zinc-500">/ {groups.length}</span></div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-400">Bài Cần Duyệt Tiếp Cận</div>
            <div className="text-xl font-bold text-amber-400 mt-0.5">{pendingReviewCount} bài</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <MessageSquareCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-400">Đã Bình Luận Tiếp Cận</div>
            <div className="text-xl font-bold text-cyan-400 mt-0.5">{outreachSentCount} bài</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-400">Khách Hàng Trong CRM</div>
            <div className="text-xl font-bold text-emerald-400 mt-0.5">{leads.length} khách <span className="text-xs text-zinc-400">({bookedCount} chốt)</span></div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* =========================================================================
          4. THANH CHUYỂN TAB KHU VỰC LÀM VIỆC (WORKSPACE TABS)
      ========================================================================== */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'feed'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <MessageSquareCheck className="w-4 h-4" />
            <span>1. Duyệt & Gửi Bình Luận ({filteredPosts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('crm')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'crm'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>2. Đường Ống Khách Hàng CRM ({leads.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('groups')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'groups'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>3. Quản Lý Nhóm Theo Dõi ({groups.length})</span>
          </button>
        </div>

        {/* Nút hành động phụ */}
        {activeTab === 'crm' && (
          <button
            onClick={handleExportCsv}
            disabled={isExportingCsv}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>{isExportingCsv ? 'Đang xuất...' : 'Xuất File Excel/CSV'}</span>
          </button>
        )}
      </div>

      {/* =========================================================================
          5. NỘI DUNG WORKSPACE THEO TAB ĐƯỢC CHỌN
      ========================================================================== */}

      {/* ----------------- TAB 1: DUYỆT & GỬI BÌNH LUẬN TIẾP CẬN ----------------- */}
      {activeTab === 'feed' && (
        <div className="space-y-4">
          
          {/* Bộ lọc bài */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <span className="text-zinc-400">Lọc bài:</span>
              <button
                onClick={() => setFeedFilter('looking')}
                className={`px-3 py-1 rounded-lg ${feedFilter === 'looking' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'bg-zinc-800 text-zinc-400'}`}
              >
                Cần Chụp Ảnh Chưa Gửi
              </button>
              <button
                onClick={() => setFeedFilter('pending')}
                className={`px-3 py-1 rounded-lg ${feedFilter === 'pending' ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30' : 'bg-zinc-800 text-zinc-400'}`}
              >
                Chờ Duyệt
              </button>
              <button
                onClick={() => setFeedFilter('commented')}
                className={`px-3 py-1 rounded-lg ${feedFilter === 'commented' ? 'bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30' : 'bg-zinc-800 text-zinc-400'}`}
              >
                Đã Tiếp Cận
              </button>
              <button
                onClick={() => setFeedFilter('all')}
                className={`px-3 py-1 rounded-lg ${feedFilter === 'all' ? 'bg-zinc-700 text-white font-bold' : 'bg-zinc-800 text-zinc-400'}`}
              >
                Tất Cả Bài
              </button>
            </div>

            <span className="text-zinc-500 text-xs">Hiển thị {filteredPosts.length} bài</span>
          </div>

          {/* Danh sách bài viết & hộp duyệt gửi bình luận */}
          {filteredPosts.length === 0 ? (
            <div className="p-10 rounded-2xl glass-card text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-sm font-bold text-white">Hiện Chưa Có Bài Viết Nào Trong Mục Này</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Bạn có thể dán link bài viết Facebook vào ô "Nhập Nhanh Bài Facebook" ở trên hoặc chọn tab "Quản Lý Nhóm" để kích hoạt quét bài mới.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredPosts.map((post) => {
                const cls = post.classification;
                const isLooking = cls?.intent === 'looking_for_service';
                const isContacted = post.interaction?.status === 'sent_confirmed';
                const currentCommentText = editedComments[post.id] !== undefined 
                  ? editedComments[post.id] 
                  : (cls?.suggested_comment_text || '');

                return (
                  <div key={post.id} className="p-5 rounded-2xl glass-card border border-zinc-800/80 space-y-4">
                    
                    {/* Header bài viết */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/60 pb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-sm">{post.author_name}</span>
                          <span className="text-zinc-600">•</span>
                          <span className="text-amber-400 text-xs font-medium">{post.group_name || 'Bài viết ngoài nhóm'}</span>
                          <span className="text-zinc-600">•</span>
                          <span className="text-zinc-400 text-xs">{new Date(post.posted_at).toLocaleString('vi-VN')}</span>
                        </div>
                        {post.post_url && (
                          <a
                            href={post.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-cyan-400 hover:underline flex items-center mt-0.5"
                          >
                            <span>Xem bài gốc trên Facebook</span>
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </a>
                        )}
                      </div>

                      {/* Phân loại & Trạng thái */}
                      <div className="flex items-center space-x-2">
                        {isLooking ? (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                            Cần Chụp Ảnh ({cls?.service_detected || 'Dịch vụ'})
                          </span>
                        ) : (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                            Ý định: {cls?.intent || 'Chưa rõ'}
                          </span>
                        )}

                        {isContacted && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 font-semibold border border-cyan-500/20 flex items-center space-x-1">
                            <Check className="w-3 h-3" />
                            <span>Đã Bình Luận</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Nội dung bài viết */}
                    <div className="p-3 rounded-xl bg-[#0b0e14] border border-zinc-800/60 text-xs text-zinc-200 leading-relaxed font-sans">
                      {post.content_raw}
                    </div>

                    {/* Hộp soạn thảo & Duyệt gửi bình luận */}
                    <div className="p-4 rounded-xl bg-[#11141c] border border-zinc-700/60 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-300 flex items-center space-x-1.5">
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Nội Dung Bình Luận Gửi Khách (Maison MIPA):</span>
                        </span>
                        <span className="text-zinc-400 text-[11px]">
                          Điểm tin cậy: <strong className="text-emerald-400">{cls?.confidence_score ? `${cls.confidence_score}%` : '100%'}</strong>
                        </span>
                      </div>

                      <textarea
                        rows={3}
                        value={currentCommentText}
                        onChange={(e) => setEditedComments({ ...editedComments, [post.id]: e.target.value })}
                        disabled={isContacted || dispatchingId === post.id}
                        placeholder="Nhập nội dung bình luận tiếp cận khách..."
                        className="w-full bg-[#161a24] border border-zinc-700 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 leading-relaxed"
                      />

                      {/* Nút hành động */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="text-[11px] text-zinc-400">
                          {isContacted ? (
                            <span className="text-cyan-400">✓ Đã tiếp cận thành công vào {new Date(post.interaction?.dispatched_at || '').toLocaleString('vi-VN')}</span>
                          ) : (
                            <span>Khóa an toàn chống trùng: Toàn hệ thống chỉ gửi 1 lần duy nhất</span>
                          )}
                        </div>

                        {!isContacted && (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleDispatchComment(post, true)}
                              disabled={dispatchingId === post.id}
                              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
                            >
                              Đã Tự Gõ Thủ Công
                            </button>

                            <button
                              onClick={() => handleDispatchComment(post, false)}
                              disabled={dispatchingId === post.id}
                              className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-md flex items-center space-x-1.5 disabled:opacity-50"
                            >
                              <Send className={`w-3.5 h-3.5 ${dispatchingId === post.id ? 'animate-bounce' : ''}`} />
                              <span>{dispatchingId === post.id ? 'Đang Đăng Lên Facebook...' : 'Duyệt & Đăng Bằng Nick/Page Ngay'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* ----------------- TAB 2: ĐƯỜNG ỐNG KHÁCH HÀNG CRM ----------------- */}
      {activeTab === 'crm' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#11141c] border border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <Users className="w-4 h-4 text-amber-500" />
                <span>Đường Ống Chăm Sóc Khách Hàng (CRM Pipeline)</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Các khách hàng sau khi được tiếp cận từ Facebook sẽ tự động được đưa vào đây để bộ phận CSKH theo dõi và chốt lịch chụp.
              </p>
            </div>
            <button
              onClick={handleExportCsv}
              disabled={isExportingCsv}
              className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs transition-colors flex items-center space-x-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất File CSV</span>
            </button>
          </div>

          {leads.length === 0 ? (
            <div className="p-10 rounded-2xl glass-card text-center space-y-2 text-zinc-400 text-xs">
              Chưa có khách hàng nào trong CRM. Khi bạn bấm "Duyệt & Đăng" một bài viết ở Tab 1, khách sẽ tự động xuất hiện ở đây.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {leads.map((lead) => {
                const stageObj = CRM_STAGES.find(s => s.key === lead.stage);

                return (
                  <div key={lead.id} className="p-4 rounded-xl glass-card border border-zinc-800 space-y-3 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm">{lead.customer_name}</span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${stageObj?.bg} ${stageObj?.color}`}>
                          {stageObj?.label}
                        </span>
                      </div>

                      <div className="text-xs text-zinc-400 mt-1 space-y-1">
                        <div>Dịch vụ: <strong className="text-zinc-200">{lead.service_interest || 'Chụp ảnh'}</strong></div>
                        {lead.quoted_amount && (
                          <div>Báo giá: <strong className="text-emerald-400">{lead.quoted_amount.toLocaleString('vi-VN')} đ</strong></div>
                        )}
                        {lead.notes && (
                          <div className="p-2 rounded-lg bg-zinc-900/60 text-zinc-300 mt-2 text-[11px]">
                            {lead.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                      <div className="text-[11px] text-zinc-400">Đổi trạng thái CSKH:</div>
                      <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                        {CRM_STAGES.map((st) => (
                          <button
                            key={st.key}
                            onClick={() => handleUpdateLeadStage(lead.id, st.key)}
                            disabled={updatingLeadId === lead.id}
                            className={`py-1 px-1.5 rounded text-center transition-colors truncate ${
                              lead.stage === st.key
                                ? 'bg-amber-600 text-white font-bold'
                                : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>

                      {lead.post_id && (
                        <div className="text-right pt-1">
                          <Link href={`#`} onClick={() => setActiveTab('feed')} className="text-[11px] text-cyan-400 hover:underline">
                            Xem bài viết gốc →
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* ----------------- TAB 3: QUẢN LÝ NHÓM THEO DÕI ----------------- */}
      {activeTab === 'groups' && (
        <div className="space-y-4">
          
          {/* Thêm nhóm mới */}
          <div className="p-5 rounded-xl bg-[#11141c] border border-zinc-800 space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center space-x-2">
              <Plus className="w-4 h-4 text-amber-500" />
              <span>Thêm Nhóm Facebook Cần Theo Dõi Quét Bài</span>
            </h2>

            <form onSubmit={handleAddNewGroup} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Tên nhóm (VD: Hội Tìm Thợ Chụp Ảnh Sài Gòn)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="bg-[#161a24] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />

              <input
                type="text"
                placeholder="Đường dẫn URL nhóm (VD: https://facebook.com/groups/...)"
                value={newGroupUrl}
                onChange={(e) => setNewGroupUrl(e.target.value)}
                className="bg-[#161a24] border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />

              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newGroupCanPage}
                    onChange={(e) => setNewGroupCanPage(e.target.checked)}
                    className="rounded bg-zinc-800 border-zinc-700 text-amber-500"
                  />
                  <span>Cho phép Page bình luận</span>
                </label>

                <button
                  type="submit"
                  disabled={isAddingGroup}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-colors shrink-0 disabled:opacity-50"
                >
                  {isAddingGroup ? 'Đang thêm...' : 'Thêm Nhóm'}
                </button>
              </div>
            </form>
          </div>

          {/* Danh sách nhóm hiện có */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((grp) => (
              <div key={grp.id} className="p-4 rounded-xl glass-card border border-zinc-800 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{grp.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      grp.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {grp.status === 'active' ? 'Đang theo dõi' : 'Tạm dừng'}
                    </span>
                  </div>

                  <a
                    href={grp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-cyan-400 hover:underline flex items-center mt-1"
                  >
                    <span className="truncate max-w-xs">{grp.url}</span>
                    <ExternalLink className="w-3 h-3 ml-1 shrink-0" />
                  </a>

                  <div className="text-xs text-zinc-400 mt-2">
                    Quyền Page: {grp.can_page_comment ? <strong className="text-emerald-400">Được phép bình luận</strong> : <strong className="text-rose-400">Cấm Page (Chỉ nick cá nhân)</strong>}
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">Chu kỳ quét: {grp.check_interval_seconds || 150}s</span>
                  <button
                    onClick={() => {
                      setSelectedCrawlGroupId(grp.id);
                      handleTriggerCrawlGroup();
                    }}
                    disabled={isCrawlingGroup}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-400 hover:text-amber-300 font-semibold text-xs transition-colors flex items-center space-x-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${isCrawlingGroup && selectedCrawlGroupId === grp.id ? 'animate-spin' : ''}`} />
                    <span>Quét Nhóm Ngay</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* =========================================================================
          6. MODAL ĐĂNG NHẬP FACEBOOK THỰC TẾ TRỰC TIẾP TRÊN WEB
      ========================================================================== */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-[#11141c] border border-zinc-700 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <Key className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-white">Kết Nối Tài Khoản Facebook Của Bạn</h3>
              </div>
              <button onClick={() => setIsLoginModalOpen(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Hệ thống cần quyền truy cập để mở bài viết và đi bình luận dưới danh nghĩa của bạn hoặc Fanpage. Bạn có thể chọn 1 trong 2 cách dưới đây:
            </p>

            {/* Cách 1: Bật trình duyệt tự động */}
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2.5">
              <div className="font-bold text-xs text-amber-300">Cách 1: Bật Cửa Sổ Trình Duyệt Để Đăng Nhập (Khuyên Dùng)</div>
              <p className="text-xs text-zinc-400">
                Nhấn nút bên dưới để hệ thống mở một cửa sổ Chrome trên máy bạn. Bạn đăng nhập tài khoản Facebook bình thường, sau đó hệ thống sẽ tự động lưu phiên mã hóa AES-256 an toàn.
              </p>
              <button
                onClick={handleLaunchBrowserLogin}
                disabled={isLaunchingBrowser}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isLaunchingBrowser ? 'Đang mở Chrome...' : 'Mở Cửa Sổ Chrome Đăng Nhập Ngay'}</span>
              </button>
            </div>

            {/* Cách 2: Dán trực tiếp storageState */}
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-2.5">
              <div className="font-bold text-xs text-zinc-300">Cách 2: Dán Trực Tiếp StorageState / Cookie JSON</div>
              <textarea
                rows={4}
                value={rawStorageStateJson}
                onChange={(e) => setRawStorageStateJson(e.target.value)}
                placeholder='Dán nội dung JSON storageState (chứa cookies c_user, xs)...'
                className="w-full bg-[#161a24] border border-zinc-700 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handleSaveStorageStateJson}
                disabled={isSavingSession}
                className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs transition-colors"
              >
                {isSavingSession ? 'Đang lưu...' : 'Lưu Phiên Mã Hóa'}
              </button>
            </div>

            <div className="text-[11px] text-zinc-500 text-center">
              🔒 Cookie của bạn được mã hóa an toàn trên máy cục bộ bằng thuật toán AES-256-GCM.
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
