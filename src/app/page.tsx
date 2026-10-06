'use client';

import React, { useState, useEffect } from 'react';
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
  Cpu,
  Smartphone,
  Play,
  Pause,
  BatteryCharging,
  Wifi,
  Shield,
  User,
  Activity,
  Terminal,
  LogOut,
  Search,
  X
} from 'lucide-react';
import { FacebookPost, FacebookGroup, CRMLead, CRMStage } from '@/types';
import { FacebookProfile } from '@/lib/profiles';
import { apiFetch } from '@/lib/api-client';

const CRM_STAGES: { key: CRMStage; label: string; color: string; bg: string }[] = [
  { key: 'uncontacted', label: 'Chờ phản hồi', color: 'text-zinc-400', bg: 'bg-zinc-800' },
  { key: 'replied', label: 'Có phản hồi', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { key: 'consulting', label: 'Đang tư vấn', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  { key: 'quoted', label: 'Đã báo giá', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { key: 'booked', label: 'Đã chốt lịch', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  { key: 'lost', label: 'Hủy / Chưa chốt', color: 'text-rose-400', bg: 'bg-rose-500/20' },
];

export default function PhoneFarmControlHub() {
  // Profiles (Phone Matrix) State
  const [profiles, setProfiles] = useState<FacebookProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('auto');

  // Posts, CRM, Groups State
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Worker Process Control State (No terminal needed!)
  const [workerRunning, setWorkerRunning] = useState(false);
  const [workerPid, setWorkerPid] = useState<number | null>(null);
  const [workerLogs, setWorkerLogs] = useState<string[]>([]);
  const [isTogglingWorker, setIsTogglingWorker] = useState(false);

  // Quick Action States
  const [quickPostUrl, setQuickPostUrl] = useState('');
  const [quickPostContent, setQuickPostContent] = useState('');
  const [quickTargetProfile, setQuickTargetProfile] = useState<string>('auto');
  const [isImportingPost, setIsImportingPost] = useState(false);

  // Dispatch States
  const [dispatchingPostId, setDispatchingPostId] = useState<string | null>(null);
  const [editedComments, setEditedComments] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  // Active Tab
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'matrix' | 'posts' | 'crm' | 'groups'>('matrix');

  // Modal Login For Specific Profile
  const [loginTargetProfile, setLoginTargetProfile] = useState<FacebookProfile | null>(null);
  const [rawStorageStateJson, setRawStorageStateJson] = useState('');
  const [isSavingSession, setIsSavingSession] = useState(false);
  const [isLaunchingBrowser, setIsLaunchingBrowser] = useState(false);

  // Add Profile Modal
  const [isAddProfileModalOpen, setIsAddProfileModalOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileType, setNewProfileType] = useState<'personal' | 'page'>('personal');
  const [newProfileUid, setNewProfileUid] = useState('');
  const [newProfilePageId, setNewProfilePageId] = useState('');

  // Group Scanner & Auto-Discovery States
  const [selectedGroupForScan, setSelectedGroupForScan] = useState<string>('all');
  const [scanLookbackHours, setScanLookbackHours] = useState<number>(24);
  const [scanProfileId, setScanProfileId] = useState<string>('auto');
  const [isScanningGroups, setIsScanningGroups] = useState(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [showManualPostInput, setShowManualPostInput] = useState(false);

  // Add Group Modal States
  const [isAddGroupModalOpen, setIsAddGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupUrl, setNewGroupUrl] = useState('');
  const [newGroupInterval, setNewGroupInterval] = useState('150');
  const [newGroupLookback, setNewGroupLookback] = useState('24');

  // Initial Data Load
  useEffect(() => {
    loadAllData();
    const interval = setInterval(checkWorkerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [resProf, resPosts, resLeads, resGroups] = await Promise.all([
        apiFetch('/api/worker/profiles').then(r => r.json()).catch(() => ({ success: false })),
        apiFetch('/api/posts').then(r => r.json()).catch(() => ({ success: false })),
        apiFetch('/api/leads').then(r => r.json()).catch(() => ({ success: false })),
        apiFetch('/api/groups').then(r => r.json()).catch(() => ({ success: false })),
      ]);

      if (resProf.success) setProfiles(resProf.data || []);
      if (resPosts.success) setPosts(resPosts.data || []);
      if (resLeads.success) setLeads(resLeads.data || []);
      if (resGroups.success) setGroups(resGroups.data || []);

      await checkWorkerStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const checkWorkerStatus = async () => {
    try {
      const res = await apiFetch('/api/worker/control');
      const data = await res.json();
      if (data.success && data.data) {
        setWorkerRunning(data.data.isRunning);
        setWorkerPid(data.data.pid);
        if (Array.isArray(data.data.logs)) {
          setWorkerLogs(data.data.logs);
        }
      }
    } catch {}
  };

  // Toggle Background Worker (Start / Stop 1-Click)
  const handleToggleWorker = async () => {
    setIsTogglingWorker(true);
    try {
      const action = workerRunning ? 'stop' : 'start';
      const res = await apiFetch('/api/worker/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(data.message);
        await checkWorkerStatus();
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setIsTogglingWorker(false);
    }
  };

  // Launch Headed Chrome Login for Specific Profile
  const handleLaunchBrowserLoginForProfile = async (profileId: string) => {
    setIsLaunchingBrowser(true);
    try {
      const res = await apiFetch('/api/worker/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'launch_login',
          id: profileId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setIsLaunchingBrowser(false);
    }
  };

  // Save Session StorageState JSON for Specific Profile
  const handleSaveSessionForProfile = async (profileId: string) => {
    if (!rawStorageStateJson.trim()) {
      alert('Vui lòng dán dữ liệu cookie/storageState JSON!');
      return;
    }

    setIsSavingSession(true);
    try {
      const res = await apiFetch('/api/worker/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_session',
          id: profileId,
          storageStateJson: rawStorageStateJson.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Đã lưu phiên đăng nhập Facebook cho thiết bị [${profileId}] thành công!`);
        setLoginTargetProfile(null);
        setRawStorageStateJson('');
        loadAllData();
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setIsSavingSession(false);
    }
  };

  // Delete Session for Specific Profile
  const handleDeleteSessionForProfile = async (profileId: string) => {
    if (!confirm('Bạn có chắc chắn muốn đăng xuất tài khoản của thiết bị này?')) return;
    try {
      const res = await apiFetch('/api/worker/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_session',
          id: profileId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Đã đăng xuất tài khoản của thiết bị [${profileId}].`);
        setLoginTargetProfile(null);
        loadAllData();
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  };

  // Toggle Account Type (Personal vs Fanpage)
  const handleToggleAccountType = async (profile: FacebookProfile) => {
    const nextType = profile.type === 'personal' ? 'page' : 'personal';
    try {
      const res = await apiFetch('/api/worker/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: profile.id,
          updates: { type: nextType },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, type: nextType } : p));
        setNotice(`Đã chuyển thiết bị [${profile.slot}] sang chế độ: ${nextType === 'personal' ? 'Tài Khoản Cá Nhân' : 'Fanpage'}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle Profile Status (Online / Idle / Offline)
  const handleToggleProfileStatus = async (profile: FacebookProfile) => {
    const nextStatus = profile.status === 'online' ? 'idle' : 'online';
    try {
      const res = await apiFetch('/api/worker/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: profile.id,
          updates: { status: nextStatus },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, status: nextStatus } : p));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Batch Toggle All Accounts
  const handleBatchToggleAll = async (status: 'online' | 'idle') => {
    try {
      const res = await apiFetch('/api/worker/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_all', status }),
      });
      const data = await res.json();
      if (data.success) {
        setProfiles(prev => prev.map(p => ({ ...p, status })));
        setNotice(`Đã chuyển toàn bộ ${profiles.length} thiết bị/tài khoản sang: ${status === 'online' ? 'HOẠT ĐỘNG' : 'TẠM NGHỈ'}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Dispatch Comment with Selected Profile (Supports Personal Account!)
  const handleDispatchComment = async (post: FacebookPost, profileId?: string) => {
    if (dispatchingPostId) return;

    let targetProf: FacebookProfile | undefined;
    if (profileId && profileId !== 'auto') {
      targetProf = profiles.find(p => p.id === profileId);
    } else {
      targetProf = profiles.find(p => p.status === 'online' && p.hasSession) || profiles[0];
    }

    const commentText = editedComments[post.id] !== undefined
      ? editedComments[post.id]
      : (post.classification?.suggested_comment_text || '');

    if (!commentText.trim()) {
      alert('Vui lòng nhập nội dung bình luận!');
      return;
    }

    setDispatchingPostId(post.id);
    setNotice(null);

    try {
      const accountType = targetProf?.type || 'personal';
      const res = await apiFetch(`/api/posts/${post.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment_content: commentText.trim(),
          operator_name: targetProf ? `${targetProf.name} (${accountType})` : 'Marketing Maison MIPA',
          account_type: accountType,
          profile_id: targetProf?.id,
          page_identity: targetProf?.pageName || 'Maison MIPA',
          target_page_id: targetProf?.pageId,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setNotice(`✓ Đã gửi bình luận tiếp cận thành công bằng [${targetProf?.name || 'Tài khoản'}] (${accountType === 'personal' ? 'Nick Cá Nhân' : 'Page'})! Khách đã được đưa vào CRM.`);
        
        if (targetProf) {
          setProfiles(prev => prev.map(p => p.id === targetProf!.id ? { ...p, todayComments: p.todayComments + 1, lastAction: `Bình luận khách lúc ${new Date().toLocaleTimeString('vi-VN')}` } : p));
        }

        loadAllData();
      } else {
        if (data.needsAuth) {
          if (targetProf) setLoginTargetProfile(targetProf);
          alert(`Thiết bị [${targetProf?.name || 'này'}] chưa đăng nhập Facebook! Hãy bấm nút Đăng Nhập cho nick này.`);
        } else {
          alert('Lỗi gửi bình luận: ' + data.error);
        }
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setDispatchingPostId(null);
    }
  };

  // Quick Post Import
  const handleQuickImportPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPostUrl.trim() && !quickPostContent.trim()) {
      alert('Vui lòng nhập link bài viết Facebook!');
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
          author_name: 'Khách hàng Facebook',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice('Đã thêm bài viết mới vào danh sách chờ duyệt!');
        setQuickPostUrl('');
        setQuickPostContent('');
        loadAllData();
        setActiveWorkspaceTab('posts');
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setIsImportingPost(false);
    }
  };

  // Add New Profile / Device
  const handleAddNewProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) {
      alert('Vui lòng nhập tên tài khoản / thiết bị!');
      return;
    }

    try {
      const res = await apiFetch('/api/worker/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          name: newProfileName.trim(),
          type: newProfileType,
          fbUserId: newProfileUid.trim() || undefined,
          pageId: newProfilePageId.trim() || undefined,
          pageName: newProfileType === 'page' ? newProfileName.trim() : undefined,
          hasSession: false,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setProfiles(prev => [...prev, data.data]);
        setIsAddProfileModalOpen(false);
        setNewProfileName('');
        setNewProfileUid('');
        setNewProfilePageId('');
        setNotice(`Đã thêm thiết bị mới [${data.data.slot}]! Hãy bấm Đăng Nhập cho thiết bị này.`);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  };

  // Automated Group Scan Trigger
  const handleScanGroups = async (targetGroupIds?: string[]) => {
    setIsScanningGroups(true);
    setNotice(null);
    try {
      const ids = targetGroupIds || (selectedGroupForScan === 'all' ? 'all' : [selectedGroupForScan]);
      const res = await apiFetch('/api/groups/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupIds: ids,
          lookbackHours: scanLookbackHours,
          profileId: scanProfileId === 'auto' ? undefined : scanProfileId,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(data.message || 'Quét bài viết từ nhóm thành công!');
        await loadAllData();
        setActiveWorkspaceTab('posts');
      } else {
        alert('Lỗi quét nhóm: ' + (data.error || data.message));
      }
    } catch (e: any) {
      alert('Lỗi kết nối: ' + e.message);
    } finally {
      setIsScanningGroups(false);
    }
  };

  // Add Facebook Group Handler
  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !newGroupUrl.trim()) {
      alert('Vui lòng nhập tên nhóm và đường link Facebook của nhóm!');
      return;
    }
    try {
      const res = await apiFetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          url: newGroupUrl.trim(),
          check_interval_seconds: parseInt(newGroupInterval, 10) || 150,
          lookback_hours: parseInt(newGroupLookback, 10) || 24,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Đã thêm nhóm "${data.data.name}" vào danh sách theo dõi.`);
        setIsAddGroupModalOpen(false);
        setNewGroupName('');
        setNewGroupUrl('');
        await loadAllData();
      } else {
        alert('Lỗi: ' + data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  // Quick stats
  const onlineProfilesCount = profiles.filter(p => p.status === 'online').length;
  const loggedInProfilesCount = profiles.filter(p => p.hasSession).length;
  const personalProfilesCount = profiles.filter(p => p.type === 'personal').length;
  const pageProfilesCount = profiles.filter(p => p.type === 'page').length;
  const totalCommentsSentToday = profiles.reduce((sum, p) => sum + p.todayComments, 0);
  const filteredPosts = selectedGroupFilter === 'all' 
    ? posts 
    : posts.filter(p => p.group_id === selectedGroupFilter);

  return (
    <div className="min-h-screen bg-[#07090e] text-zinc-100 font-sans pb-16 space-y-5">

      {/* =========================================================================
          1. HEADER ĐIỀU HÀNH MA TRẬN ĐA THIẾT BỊ / PHONE FARM (TOP BAR)
      ========================================================================== */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#0b0e17] border border-emerald-950/60 shadow-2xl space-y-4">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono font-bold border border-emerald-500/30 flex items-center space-x-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1"></span>
                <span>MULTI-ACCOUNT PHONE MATRIX</span>
              </span>
              <span className="text-zinc-600">•</span>
              <span className="text-zinc-400 font-medium">Quản Lý & Đăng Nhập Riêng Từng Tài Khoản Facebook</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-black mt-1 text-white tracking-tight flex items-center space-x-2">
              <span>Bàn Làm Việc Dàn Nick & Tiếp Cận Khách Hàng</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Đăng nhập riêng từng nick • Chạy song song nick cá nhân & Fanpage • Bật/Dừng worker 1-click không cần terminal
            </p>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5">

            {/* Worker On/Off Toggle Button */}
            <button
              onClick={handleToggleWorker}
              disabled={isTogglingWorker}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-lg ${
                workerRunning
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/40 shadow-emerald-900/30'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700'
              }`}
            >
              {workerRunning ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Dừng Worker Tự Động {workerPid ? `(PID: ${workerPid})` : ''}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
                  <span>BẬT WORKER TỰ ĐỘNG (1-CLICK)</span>
                </>
              )}
            </button>

            {/* Add New Profile Button */}
            <button
              onClick={() => setIsAddProfileModalOpen(true)}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-emerald-500/30 font-bold text-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Nick Mới</span>
            </button>

            {/* Refresh Data */}
            <button
              onClick={loadAllData}
              title="Làm mới toàn bộ dữ liệu"
              className="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Global Notices */}
        {notice && (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{notice}</span>
            </div>
            <button onClick={() => setNotice(null)} className="text-zinc-400 hover:text-white text-xs">✕</button>
          </div>
        )}

        {/* =========================================================================
            TRUNG TÂM QUÉT & TÌM BÀI TỰ ĐỘNG THEO NHÓM FACEBOOK (AUTO DISCOVERY)
        ========================================================================== */}
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0d121c] via-[#090d14] to-[#0a1018] border-2 border-emerald-500/40 shadow-2xl space-y-3.5">
          
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                <Search className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs sm:text-sm font-black text-white flex items-center space-x-2">
                  <span>TỰ ĐỘNG TÌM BÀI VIẾT THEO NHÓM FACEBOOK</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                    Auto Post Discovery
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400">
                  Bạn chỉ việc chọn các hội nhóm — Hệ thống tự động vào nhóm quét bài mới, nhận diện nhu cầu váy cưới/áo dài/studio và đưa về danh sách.
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsAddGroupModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-bold transition-colors flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>+ Thêm Nhóm Mới</span>
              </button>

              <button
                type="button"
                onClick={handleToggleWorker}
                disabled={isTogglingWorker}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border ${
                  workerRunning 
                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/50 hover:bg-rose-950/40 hover:text-rose-300' 
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>{workerRunning ? '⚡ Quét Định Kỳ: Đang Bật (Tắt)' : '▶ Bật Quét Tự Động Ngầm'}</span>
              </button>
            </div>
          </div>

          {/* Form Chọn Nhóm & Bấm Quét Tự Động */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            
            {/* 1. Chọn nhóm mục tiêu (5 cột) */}
            <div className="md:col-span-5 space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 flex items-center space-x-1">
                <Radio className="w-3 h-3 text-emerald-400" />
                <span>Nhóm Facebook Cần Tìm Bài:</span>
              </label>
              <select
                value={selectedGroupForScan}
                onChange={(e) => setSelectedGroupForScan(e.target.value)}
                className="w-full bg-[#111622] border border-zinc-700 rounded-xl px-3 py-2 text-xs font-semibold text-emerald-300 focus:outline-none focus:border-emerald-500"
              >
                <option value="all">⚡ Quét TẤT CẢ các nhóm đang theo dõi ({groups.length} nhóm)</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    📁 {g.name} ({g.total_posts_found || 0} bài đã tìm)
                  </option>
                ))}
              </select>
            </div>

            {/* 2. Chọn Nick / Thiết bị đi quét (3 cột) */}
            <div className="md:col-span-3 space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 flex items-center space-x-1">
                <Smartphone className="w-3 h-3 text-emerald-400" />
                <span>Nick Đi Quét:</span>
              </label>
              <select
                value={scanProfileId}
                onChange={(e) => setScanProfileId(e.target.value)}
                className="w-full bg-[#111622] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="auto">⚡ Tự động chọn nick rảnh</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{String(p.slot).padStart(2, '0')}] {p.name} {p.hasSession ? '✓' : '(Chưa login)'}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Khung giờ quét (2 cột) */}
            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-bold text-zinc-400 block">
                Khung Giờ:
              </label>
              <select
                value={scanLookbackHours}
                onChange={(e) => setScanLookbackHours(Number(e.target.value))}
                className="w-full bg-[#111622] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              >
                <option value={6}>6 giờ qua</option>
                <option value={12}>12 giờ qua</option>
                <option value={24}>24 giờ qua (Chuẩn)</option>
                <option value={48}>48 giờ qua</option>
              </select>
            </div>

            {/* 4. Nút Hành Động Lớn (2 cột) */}
            <div className="md:col-span-2">
              <button
                type="button"
                onClick={() => handleScanGroups()}
                disabled={isScanningGroups}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-black text-xs transition-all shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                <Search className={`w-4 h-4 ${isScanningGroups ? 'animate-spin' : ''}`} />
                <span>{isScanningGroups ? 'Đang Quét...' : 'QUÉT BÀI NGAY'}</span>
              </button>
            </div>

          </div>

          {/* Dòng bổ trợ: Nhập bài thủ công khi cần */}
          <div className="pt-1 flex flex-wrap items-center justify-between text-[11px] text-zinc-500">
            <button
              type="button"
              onClick={() => setShowManualPostInput(!showManualPostInput)}
              className="hover:text-zinc-300 underline flex items-center space-x-1"
            >
              <span>{showManualPostInput ? '▼ Thu gọn nhập bài lẻ' : '▶ Bạn có link bài Facebook cụ thể muốn dán ngay? Bấm vào đây'}</span>
            </button>
            <span className="text-zinc-500 font-mono text-[10px]">
              {groups.length} nhóm theo dõi • {posts.length} bài viết đã thu thập
            </span>
          </div>

          {showManualPostInput && (
            <form onSubmit={handleQuickImportPost} className="p-3 rounded-xl bg-[#070a10] border border-zinc-800 flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                placeholder="Dán link bài Facebook lẻ (https://facebook.com/...)"
                value={quickPostUrl}
                onChange={(e) => setQuickPostUrl(e.target.value)}
                className="flex-1 w-full bg-[#111420] border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={isImportingPost}
                className="w-full sm:w-auto px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-emerald-400 font-bold text-xs shrink-0 transition-colors"
              >
                {isImportingPost ? 'Đang thêm...' : 'Phân Tích Bài Lẻ'}
              </button>
            </form>
          )}

        </div>

      </div>

      {/* =========================================================================
          2. THANH STATS TỔNG HỢP & CHUYỂN TAB WORKSPACE
      ========================================================================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl bg-[#0b0e17] border border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 font-medium">Tổng Dàn Thiết Bị / Nick</div>
            <div className="text-xl font-black text-white mt-0.5">{profiles.length} máy <span className="text-xs text-emerald-400">({loggedInProfilesCount} Đã Đăng Nhập)</span></div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <Smartphone className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#0b0e17] border border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 font-medium">Cơ Cấu Tài Khoản</div>
            <div className="text-xl font-black text-white mt-0.5">
              <span className="text-emerald-400">{personalProfilesCount} Cá Nhân</span> <span className="text-xs text-zinc-500">• {pageProfilesCount} Page</span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <User className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#0b0e17] border border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 font-medium">Bình Luận Đã Gửi Hôm Nay</div>
            <div className="text-xl font-black text-emerald-400 mt-0.5">{totalCommentsSentToday} cmt</div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
            <MessageSquareCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-[#0b0e17] border border-zinc-800 flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-400 font-medium">Trạng Thái Worker Ngầm</div>
            <div className="text-base font-bold mt-0.5 flex items-center space-x-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${workerRunning ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`}></span>
              <span className={workerRunning ? 'text-emerald-400' : 'text-zinc-400'}>
                {workerRunning ? 'Đang Chạy Tự Động' : 'Đang Nghỉ'}
              </span>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Cpu className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 pb-2 gap-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveWorkspaceTab('matrix')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeWorkspaceTab === 'matrix'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>1. DÀN THIẾT BỊ & ĐĂNG NHẬP RIÊNG TỪNG NICK ({profiles.length})</span>
          </button>

          <button
            onClick={() => setActiveWorkspaceTab('posts')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeWorkspaceTab === 'posts'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <MessageSquareCheck className="w-4 h-4" />
            <span>2. BÀI VIẾT ĐÃ TÌM ĐƯỢC ({posts.length})</span>
          </button>

          <button
            onClick={() => setActiveWorkspaceTab('groups')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeWorkspaceTab === 'groups'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>3. NHÓM FACEBOOK THEO DÕI ({groups.length})</span>
          </button>

          <button
            onClick={() => setActiveWorkspaceTab('crm')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeWorkspaceTab === 'crm'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40'
                : 'bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>4. ĐƯỜNG ỐNG KHÁCH HÀNG CRM ({leads.length})</span>
          </button>
        </div>

        {activeWorkspaceTab === 'matrix' && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleBatchToggleAll('online')}
              className="px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 text-xs font-semibold transition-colors"
            >
              ▶ Bật Tất Cả
            </button>
            <button
              onClick={() => handleBatchToggleAll('idle')}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
            >
              ⏸ Tạm Dừng Tất Cả
            </button>
          </div>
        )}
      </div>

      {/* =========================================================================
          3. TAB 1: MA TRẬN MÀN HÌNH ĐIỆN THOẠI (CÓ NÚT ĐĂNG NHẬP RIÊNG TỪNG NICK)
      ========================================================================== */}
      {activeWorkspaceTab === 'matrix' && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">

          {/* CỘT TRÁI (3 CỘT): MA TRẬN MÀN HÌNH ĐIỆN THOẠI */}
          <div className="xl:col-span-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {profiles.map((profile) => {
              const isOnline = profile.status === 'online';
              const isBusy = profile.status === 'busy';
              const isPersonal = profile.type === 'personal';
              const hasSession = profile.hasSession;

              return (
                <div
                  key={profile.id}
                  className={`relative rounded-3xl p-3.5 transition-all duration-300 flex flex-col justify-between h-[390px] bg-gradient-to-b from-[#0f1420] via-[#090d14] to-[#06080e] border-2 ${
                    isBusy
                      ? 'border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                      : !hasSession
                        ? 'border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                        : isOnline
                          ? 'border-emerald-500/70 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                          : 'border-zinc-800 opacity-70'
                  }`}
                >
                  {/* PHONE TOP NOTCH & STATUS BAR */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 pb-2 border-b border-zinc-800/80">
                      {/* Slot Badge (01, 02... như trong ảnh) */}
                      <span className={`px-2 py-0.5 rounded font-black text-xs ${
                        isOnline ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-zinc-800 text-zinc-400'
                      }`}>
                        {String(profile.slot).padStart(2, '0')}
                      </span>

                      {/* Phone Speaker Notch */}
                      <div className="w-10 h-1 rounded-full bg-zinc-700/80"></div>

                      {/* Battery & Signal */}
                      <div className="flex items-center space-x-1.5 text-[10px]">
                        <Wifi className="w-3 h-3 text-zinc-400" />
                        <span className="text-zinc-300">{profile.batteryLevel}%</span>
                        <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                    </div>

                    {/* ACCOUNT TYPE & LOGIN STATUS BADGES */}
                    <div className="mt-2.5 flex items-center justify-between gap-1">
                      <button
                        onClick={() => handleToggleAccountType(profile)}
                        title="Bấm để đổi loại tài khoản (Cá nhân / Page)"
                        className={`text-[10px] px-2 py-0.5 rounded-lg font-bold flex items-center space-x-1 transition-all ${
                          isPersonal 
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30' 
                            : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30'
                        }`}
                      >
                        {isPersonal ? <User className="w-3 h-3 mr-0.5" /> : <Shield className="w-3 h-3 mr-0.5" />}
                        <span>{isPersonal ? 'Cá Nhân' : 'Page'}</span>
                      </button>

                      {/* Login Status Badge */}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center space-x-1 ${
                        hasSession 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30 animate-pulse'
                      }`}>
                        <span>{hasSession ? '✓ Đã Đăng Nhập' : '✕ Chưa Đăng Nhập'}</span>
                      </span>
                    </div>

                    {/* ACCOUNT INFO */}
                    <div className="mt-2.5 p-2 rounded-xl bg-[#070a10] border border-zinc-800/80 space-y-0.5">
                      <div className="text-xs font-bold text-white truncate" title={profile.name}>
                        {profile.name}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400 truncate">
                        UID: {profile.fbUserId || (isPersonal ? 'Chưa nạp' : profile.pageId || 'Chưa nạp')}
                      </div>
                    </div>

                    {/* LIVE METRICS INSIDE PHONE */}
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-center">
                      <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
                        <div className="text-[9px] text-zinc-400">Hôm nay</div>
                        <div className="text-xs font-extrabold text-emerald-400">{profile.todayComments} cmt</div>
                      </div>
                      <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800/60">
                        <div className="text-[9px] text-zinc-400">Giới hạn</div>
                        <div className="text-xs font-extrabold text-zinc-200">{profile.maxDailyComments} cmt</div>
                      </div>
                    </div>

                    {/* RECENT ACTION / LOG */}
                    <div className="mt-2 p-1.5 rounded-lg bg-[#0c1018] border border-zinc-800/60 text-[10px] text-zinc-300 leading-tight">
                      <div className="truncate text-zinc-300">{profile.lastAction || 'Sẵn sàng nhận việc'}</div>
                    </div>
                  </div>

                  {/* BOTTOM PHONE CONTROLS (BAO GỒM NÚT ĐĂNG NHẬP RIÊNG) */}
                  <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                    
                    {/* Nút Đăng Nhập Riêng Cho Nick Này */}
                    <button
                      onClick={() => setLoginTargetProfile(profile)}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1 ${
                        hasSession
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                          : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg animate-pulse'
                      }`}
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>{hasSession ? 'Đổi Nick / Nạp Lại FB' : 'ĐĂNG NHẬP NICK NÀY'}</span>
                    </button>

                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        onClick={() => handleToggleProfileStatus(profile)}
                        className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                          isOnline 
                            ? 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400' 
                            : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                        }`}
                      >
                        {isOnline ? 'Tạm Dừng' : 'Bật Máy'}
                      </button>

                      <button
                        onClick={() => {
                          setActiveWorkspaceTab('posts');
                          setNotice(`Đã chọn thiết bị [${profile.slot}: ${profile.name}] để gửi bình luận tiếp theo.`);
                        }}
                        className="flex-1 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold transition-colors"
                      >
                        Gửi Bài
                      </button>
                    </div>

                  </div>

                </div>
              );
            })}
          </div>

          {/* CỘT PHẢI (1 CỘT): BẢNG ĐIỀU KHIỂN & NHẬT KÝ THỰC THI (SIDEBAR) */}
          <div className="space-y-4">
            
            {/* Control Console Card */}
            <div className="p-4 rounded-2xl bg-[#0b0e17] border border-emerald-950/70 shadow-xl space-y-3.5">
              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-400">
                <Terminal className="w-4 h-4" />
                <span>BẢNG ĐIỀU KHIỂN TOÀN DÀN MÁY</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-400">Tiến trình Worker:</span>
                  <span className={`font-bold ${workerRunning ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {workerRunning ? `Online (PID: ${workerPid})` : 'Offline'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-400">Đã nạp session:</span>
                  <span className="text-emerald-400 font-bold">{loggedInProfilesCount} / {profiles.length} máy</span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/60 border border-zinc-800">
                  <span className="text-zinc-400">Chế độ phân bổ:</span>
                  <span className="text-zinc-200 font-semibold">Tự động xoay vòng</span>
                </div>
              </div>

              {/* Master Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  onClick={handleToggleWorker}
                  disabled={isTogglingWorker}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-2 shadow-lg"
                >
                  <Cpu className="w-4 h-4" />
                  <span>{workerRunning ? 'Dừng Toàn Bộ Tiến Trình' : 'Khởi Chạy Toàn Bộ Dàn Nick'}</span>
                </button>

                <button
                  onClick={() => setIsAddProfileModalOpen(true)}
                  className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-emerald-500/30 font-bold text-xs transition-colors"
                >
                  + Thêm Thiết Bị / Nick Cá Nhân
                </button>
              </div>
            </div>

            {/* Live Activity Terminal */}
            <div className="p-4 rounded-2xl bg-[#07090e] border border-zinc-800/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-zinc-300 flex items-center space-x-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Nhật Ký Tự Động (Live Logs)</span>
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">{workerLogs.length} dòng</span>
              </div>

              <div className="h-64 overflow-y-auto font-mono text-[11px] text-emerald-400/90 bg-[#04060a] p-3 rounded-xl border border-zinc-900 space-y-1 leading-relaxed">
                {workerLogs.length === 0 ? (
                  <div className="text-zinc-600 italic">Đang chờ sự kiện mới từ các thiết bị...</div>
                ) : (
                  workerLogs.map((log, i) => (
                    <div key={i} className="hover:bg-emerald-950/20 rounded px-1">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      )}

      {/* =========================================================================
          4. TAB 2: DUYỆT BÀI & GỬI BÌNH LUẬN (CHỌN NICK CÁ NHÂN HOẶC PAGE)
      ========================================================================== */}
      {/* =========================================================================
          4. TAB 2: DUYỆT BÀI & GỬI BÌNH LUẬN (CHỌN NICK CÁ NHÂN HOẶC PAGE)
      ========================================================================== */}
      {activeWorkspaceTab === 'posts' && (
        <div className="space-y-4">
          {/* Header & Quét Nhóm */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0b0e17] border border-zinc-800">
            <div>
              <h2 className="text-base font-bold text-white flex items-center space-x-2">
                <MessageSquareCheck className="w-4 h-4 text-emerald-400" />
                <span>Kho Bài Viết Tìm Thấy Từ Các Nhóm ({filteredPosts.length}/{posts.length} bài)</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Các bài viết được hệ thống quét tự động từ các nhóm Facebook và nhận diện nhu cầu khách hàng.
              </p>
            </div>

            <button
              onClick={() => handleScanGroups(selectedGroupFilter === 'all' ? undefined : [selectedGroupFilter])}
              disabled={isScanningGroups}
              className="px-3.5 py-2 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition-all flex items-center space-x-1.5 self-start sm:self-auto"
            >
              <Search className={`w-3.5 h-3.5 ${isScanningGroups ? 'animate-spin' : ''}`} />
              <span>{isScanningGroups ? 'Đang Quét Thêm Bài...' : '🔍 Quét Thêm Bài Từ Nhóm Này'}</span>
            </button>
          </div>

          {/* Filter chips theo từng nhóm Facebook */}
          <div className="flex flex-wrap items-center gap-1.5 p-3 rounded-xl bg-[#080b12] border border-zinc-800/80 text-xs">
            <span className="text-zinc-400 font-bold mr-1">Lọc theo nhóm:</span>
            <button
              onClick={() => setSelectedGroupFilter('all')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                selectedGroupFilter === 'all'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              Tất cả nhóm ({posts.length})
            </button>
            {groups.map(g => {
              const count = posts.filter(p => p.group_id === g.id).length;
              return (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupFilter(g.id)}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    selectedGroupFilter === g.id
                      ? 'bg-emerald-600 text-white shadow'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                >
                  📁 {g.name} ({count})
                </button>
              );
            })}
          </div>

          {filteredPosts.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#0b0e17] border border-zinc-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-400 mx-auto flex items-center justify-center">
                <Search className="w-6 h-6" />
              </div>
              <div className="text-sm font-bold text-zinc-200">Chưa có bài viết nào từ nhóm này</div>
              <p className="text-xs text-zinc-400 max-w-md mx-auto">
                Hãy nhấn nút bên dưới để bot Playwright tự động quét nhóm và tìm các bài viết có nhu cầu thuê váy/chụp ảnh mới nhất.
              </p>
              <button
                onClick={() => handleScanGroups(selectedGroupFilter === 'all' ? undefined : [selectedGroupFilter])}
                disabled={isScanningGroups}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                Bắt Đầu Quét Nhóm Ngay
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredPosts.map((post) => {
                const cls = post.classification;
                const isLooking = cls?.intent === 'looking_for_service';
                const isContacted = post.interaction?.status === 'sent_confirmed';
                const currentComment = editedComments[post.id] !== undefined
                  ? editedComments[post.id]
                  : (cls?.suggested_comment_text || '');

                return (
                  <div key={post.id} className="p-5 rounded-2xl bg-[#0b0e17] border border-zinc-800 space-y-3.5">
                    
                    {/* Header bài viết */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-white text-sm">{post.author_name}</span>
                          <span className="text-zinc-600">•</span>
                          <span className="text-emerald-400 text-xs font-medium">{post.group_name || 'Bài viết ngoài nhóm'}</span>
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
                            <span>Mở bài gốc trên Facebook</span>
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center space-x-2">
                        {isLooking && (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
                            {cls?.service_detected || 'Cần chụp ảnh'}
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
                    <div className="p-3 rounded-xl bg-[#07090e] border border-zinc-800/60 text-xs text-zinc-200 leading-relaxed font-sans">
                      {post.content_raw}
                    </div>

                    {/* Soạn thảo bình luận */}
                    <div className="p-4 rounded-xl bg-[#10141f] border border-zinc-700/60 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-300 flex items-center space-x-1.5">
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Nội dung bình luận tiếp cận khách:</span>
                        </span>
                        <span className="text-zinc-400 text-[11px]">
                          Điểm tin cậy: <strong className="text-emerald-400">{cls?.confidence_score ? `${cls.confidence_score}%` : '100%'}</strong>
                        </span>
                      </div>

                      <textarea
                        rows={3}
                        value={currentComment}
                        onChange={(e) => setEditedComments({ ...editedComments, [post.id]: e.target.value })}
                        disabled={isContacted || dispatchingPostId === post.id}
                        className="w-full bg-[#161a24] border border-zinc-700 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 leading-relaxed"
                      />

                      {/* Thao tác gửi & Chọn nick */}
                      {!isContacted && (
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <div className="flex items-center space-x-2 text-xs">
                            <span className="text-zinc-400">Gửi bằng:</span>
                            <select
                              onChange={(e) => setSelectedProfileId(e.target.value)}
                              className="bg-[#0b0e17] border border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-emerald-300 focus:outline-none focus:border-emerald-500"
                            >
                              <option value="auto">⚡ Tự động chọn nick rảnh</option>
                              {profiles.map((p) => (
                                <option key={p.id} value={p.id}>
                                  [{String(p.slot).padStart(2, '0')}] {p.name} ({p.type === 'personal' ? '👤 Cá nhân' : '🏷️ Page'}) {p.hasSession ? '✓' : '(Chưa login)'}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleDispatchComment(post, selectedProfileId)}
                              disabled={dispatchingPostId === post.id}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all shadow-lg flex items-center space-x-1.5 disabled:opacity-50"
                            >
                              <Send className={`w-3.5 h-3.5 ${dispatchingPostId === post.id ? 'animate-bounce' : ''}`} />
                              <span>{dispatchingPostId === post.id ? 'Đang gửi bằng nick...' : 'DUYỆT & GỬI BÌNH LUẬN NGAY'}</span>
                            </button>
                          </div>
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

      {/* =========================================================================
          5. TAB 3: DANH SÁCH NHÓM FACEBOOK THEO DÕI (QUÉT BÀI TỰ ĐỘNG)
      ========================================================================== */}
      {activeWorkspaceTab === 'groups' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-[#0b0e17] border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center space-x-2">
                <Radio className="w-5 h-5 text-emerald-400" />
                <span>Các Hội Nhóm Facebook Mục Tiêu Đang Giám Sát ({groups.length} nhóm)</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Bạn chỉ cần thêm hoặc chọn nhóm ở đây. Hệ thống Playwright sẽ tự động vào các nhóm này tìm bài viết khách hàng có nhu cầu.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsAddGroupModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center space-x-1.5 shadow-lg shadow-emerald-950/40"
              >
                <Plus className="w-4 h-4" />
                <span>+ Thêm Nhóm Mới</span>
              </button>

              <button
                onClick={() => handleScanGroups()}
                disabled={isScanningGroups}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-300 border border-emerald-500/30 font-bold text-xs transition-colors flex items-center space-x-1.5"
              >
                <Search className={`w-4 h-4 ${isScanningGroups ? 'animate-spin' : ''}`} />
                <span>{isScanningGroups ? 'Đang Quét Tất Cả...' : 'Quét Tất Cả Nhóm'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((group) => {
              const postsCount = posts.filter(p => p.group_id === group.id).length;
              return (
                <div key={group.id} className="p-4 rounded-2xl bg-[#0b0e17] border border-zinc-800 space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-white text-sm leading-snug">
                        {group.name}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                        group.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400'
                      }`}>
                        {group.status === 'active' ? 'Đang theo dõi' : group.status}
                      </span>
                    </div>

                    <a
                      href={group.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-cyan-400 hover:underline flex items-center space-x-1 truncate"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{group.url}</span>
                    </a>

                    <div className="grid grid-cols-2 gap-2 text-center pt-1">
                      <div className="p-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
                        <div className="text-[10px] text-zinc-400">Bài đã tìm</div>
                        <div className="text-sm font-black text-emerald-400">{postsCount} bài</div>
                      </div>
                      <div className="p-2 rounded-xl bg-zinc-900/60 border border-zinc-800">
                        <div className="text-[10px] text-zinc-400">Chu kỳ quét</div>
                        <div className="text-sm font-bold text-zinc-300">{group.check_interval_seconds || 150}s</div>
                      </div>
                    </div>

                    <div className="text-[10px] text-zinc-400 space-y-0.5 pt-1">
                      <div>Quét gần nhất: <span className="text-zinc-300">{group.last_checked_at ? new Date(group.last_checked_at).toLocaleTimeString('vi-VN') : 'Chưa quét'}</span></div>
                      <div>Lần tới: <span className="text-emerald-400">{group.next_check_at ? new Date(group.next_check_at).toLocaleTimeString('vi-VN') : 'Sắp tới'}</span></div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800 flex items-center space-x-2">
                    <button
                      onClick={() => handleScanGroups([group.id])}
                      disabled={isScanningGroups}
                      className="flex-1 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-1"
                    >
                      <Search className="w-3 h-3" />
                      <span>Quét Nhóm Này</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedGroupFilter(group.id);
                        setActiveWorkspaceTab('posts');
                      }}
                      className="py-1.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition-colors"
                    >
                      Xem Bài ({postsCount})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          5. TAB 3: ĐƯỜNG ỐNG KHÁCH HÀNG CRM
      ========================================================================== */}
      {activeWorkspaceTab === 'crm' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-[#0b0e17] border border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>Đường Ống Khách Hàng (CRM Pipeline)</span>
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Các khách hàng được tiếp cận thành công từ mọi tài khoản (cá nhân và page) sẽ tự động tập trung về đây.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {leads.map((lead) => {
              const stageObj = CRM_STAGES.find(s => s.key === lead.stage);

              return (
                <div key={lead.id} className="p-4 rounded-xl bg-[#0b0e17] border border-zinc-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{lead.customer_name}</span>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${stageObj?.bg} ${stageObj?.color}`}>
                      {stageObj?.label}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-400 space-y-1">
                    <div>Dịch vụ: <strong className="text-zinc-200">{lead.service_interest || 'Chụp ảnh'}</strong></div>
                    {lead.quoted_amount && (
                      <div>Báo giá: <strong className="text-emerald-400">{lead.quoted_amount.toLocaleString('vi-VN')} đ</strong></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =========================================================================
          6. MODAL ĐĂNG NHẬP FACEBOOK DÀNH RIÊNG CHO TỪNG NICK
      ========================================================================== */}
      {loginTargetProfile && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-lg p-6 rounded-3xl bg-[#0e121a] border-2 border-emerald-500/50 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <Key className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    Đăng Nhập Facebook Cho Thiết Bị [{String(loginTargetProfile.slot).padStart(2, '0')}]
                  </h3>
                  <div className="text-[11px] text-emerald-400 font-semibold">
                    {loginTargetProfile.name} • {loginTargetProfile.type === 'personal' ? '👤 Tài Khoản Cá Nhân' : '🏷️ Fanpage'}
                  </div>
                </div>
              </div>
              <button onClick={() => setLoginTargetProfile(null)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Bạn có thể nạp tài khoản Facebook của riêng thiết bị này bằng 1 trong 2 cách:
            </p>

            {/* Cách 1: Bật trình duyệt tự động */}
            <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/40 space-y-2.5">
              <div className="font-bold text-xs text-emerald-300 flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cách 1: Bật Trình Duyệt Chrome Đăng Nhập Cho Nick Này (Khuyên Dùng)</span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Hệ thống sẽ mở một cửa sổ Chrome trên màn hình máy bạn. Bạn đăng nhập tài khoản Facebook của nick này, sau đó phiên sẽ được trích xuất và mã hóa AES-256 gắn riêng cho thiết bị này.
              </p>
              <button
                onClick={() => handleLaunchBrowserLoginForProfile(loginTargetProfile.id)}
                disabled={isLaunchingBrowser}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center justify-center space-x-2 shadow-lg"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isLaunchingBrowser ? 'Đang mở Chrome...' : `Mở Chrome Đăng Nhập Cho [Máy ${loginTargetProfile.slot}]`}</span>
              </button>
            </div>

            {/* Cách 2: Dán trực tiếp storageState JSON */}
            <div className="p-4 rounded-2xl bg-[#080a10] border border-zinc-800 space-y-2.5">
              <div className="font-bold text-xs text-zinc-300">
                Cách 2: Dán Trực Tiếp StorageState / Cookie JSON Của Nick Này
              </div>
              <textarea
                rows={3}
                value={rawStorageStateJson}
                onChange={(e) => setRawStorageStateJson(e.target.value)}
                placeholder='Dán nội dung JSON storageState (chứa cookies c_user, xs)...'
                className="w-full bg-[#121622] border border-zinc-700 rounded-xl p-2.5 text-xs text-zinc-100 placeholder-zinc-500 font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => handleSaveSessionForProfile(loginTargetProfile.id)}
                disabled={isSavingSession}
                className="w-full py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-emerald-300 border border-emerald-500/30 font-bold text-xs transition-colors"
              >
                {isSavingSession ? 'Đang lưu...' : 'Lưu Phiên Mã Hóa Cho Máy Này'}
              </button>
            </div>

            {/* Nút Đăng Xuất nếu đã có phiên */}
            {loginTargetProfile.hasSession && (
              <div className="pt-1 flex justify-end">
                <button
                  onClick={() => handleDeleteSessionForProfile(loginTargetProfile.id)}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center space-x-1 underline"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Đăng xuất / Xóa phiên của máy này</span>
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* =========================================================================
          7. MODAL THÊM TÀI KHOẢN / THIẾT BỊ MỚI
      ========================================================================== */}
      {isAddProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#0e121a] border border-emerald-500/40 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Thêm Thiết Bị / Nick Facebook Mới</span>
              </h3>
              <button onClick={() => setIsAddProfileModalOpen(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddNewProfile} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Tên Hiển Thị Của Nick:</label>
                <input
                  type="text"
                  placeholder="VD: Nick Cá Nhân 07 (Thành Nam)"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="w-full bg-[#161b26] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Loại Tài Khoản:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewProfileType('personal')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                      newProfileType === 'personal'
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    👤 Tài Khoản Cá Nhân
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewProfileType('page')}
                    className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                      newProfileType === 'page'
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                    }`}
                  >
                    🏷️ Fanpage
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">UID Facebook (Tùy chọn):</label>
                <input
                  type="text"
                  placeholder="VD: 100083281234567"
                  value={newProfileUid}
                  onChange={(e) => setNewProfileUid(e.target.value)}
                  className="w-full bg-[#161b26] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {newProfileType === 'page' && (
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">ID Fanpage:</label>
                  <input
                    type="text"
                    placeholder="VD: 1000987654321"
                    value={newProfilePageId}
                    onChange={(e) => setNewProfilePageId(e.target.value)}
                    className="w-full bg-[#161b26] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddProfileModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg"
                >
                  Thêm Thiết Bị Ngay
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* =========================================================================
          8. MODAL THÊM NHÓM FACEBOOK MỚI ĐỂ THEO DÕI & QUÉT BÀI TỰ ĐỘNG
      ========================================================================== */}
      {isAddGroupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md p-6 rounded-3xl bg-[#0e121a] border border-emerald-500/40 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Radio className="w-4 h-4 text-emerald-400" />
                <span>Thêm Nhóm Facebook Cần Theo Dõi</span>
              </h3>
              <button onClick={() => setIsAddGroupModalOpen(false)} className="text-zinc-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleAddGroup} className="space-y-3.5">
              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Tên Nhóm Facebook:</label>
                <input
                  type="text"
                  placeholder="VD: Hội Chụp Ảnh Áo Dài Sài Gòn"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  required
                  className="w-full bg-[#161b26] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-300 block mb-1">Đường Link Facebook Nhóm:</label>
                <input
                  type="text"
                  placeholder="VD: https://facebook.com/groups/hoidammechupaodaivn"
                  value={newGroupUrl}
                  onChange={(e) => setNewGroupUrl(e.target.value)}
                  required
                  className="w-full bg-[#161b26] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Chu Kỳ Quét (Giây):</label>
                  <input
                    type="number"
                    value={newGroupInterval}
                    onChange={(e) => setNewGroupInterval(e.target.value)}
                    className="w-full bg-[#161b26] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-300 block mb-1">Khung Giờ Quét (Giờ):</label>
                  <input
                    type="number"
                    value={newGroupLookback}
                    onChange={(e) => setNewGroupLookback(e.target.value)}
                    className="w-full bg-[#161b26] border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddGroupModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white text-xs font-bold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg"
                >
                  Lưu & Theo Dõi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
