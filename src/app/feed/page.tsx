'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  MessageSquareCheck, 
  Filter, 
  Send, 
  Edit3, 
  Trash2, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle,
  X,
  UserCheck,
  ChevronRight,
  ShieldAlert,
  Key,
  Layers,
  Tag,
  Image as ImageIcon
} from 'lucide-react';
import { FacebookPost, PostIntent } from '@/types';
import { apiFetch } from '@/lib/api-client';

export default function FeedQueuePage() {
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'looking' | 'pending' | 'commented' | 'dismissed'>('looking');
  const [isLoading, setIsLoading] = useState(true);
  const [editingPost, setEditingPost] = useState<FacebookPost | null>(null);
  const [manualPost, setManualPost] = useState<FacebookPost | null>(null);
  const [manualLink, setManualLink] = useState('');
  const [customComment, setCustomComment] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [authErrorModal, setAuthErrorModal] = useState<{ open: boolean; message: string; post?: FacebookPost } | null>(null);

  const getSafeImageUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('/api/proxy-image') || url.startsWith('data:') || url.startsWith('/')) return url;
    if (url.includes('fbcdn.net') || url.includes('facebook.com')) {
      return `/api/proxy-image?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  const [operatingMode, setOperatingMode] = useState<'manual_review' | 'auto_dispatch'>('manual_review');
  const [minConfidenceScore, setMinConfidenceScore] = useState<number>(80);
  const [isTogglingMode, setIsTogglingMode] = useState(false);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const [resPosts, resHeartbeat] = await Promise.all([
        apiFetch('/api/posts').then(r => r.json()).catch(() => ({ success: false })),
        apiFetch('/api/worker/heartbeat').then(r => r.json()).catch(() => ({ success: false })),
      ]);
      if (resPosts.success) {
        setPosts(resPosts.data);
      }
      if (resHeartbeat.success && resHeartbeat.data) {
        setOperatingMode(resHeartbeat.data.operating_mode || 'manual_review');
        if (resHeartbeat.data.min_confidence_score !== undefined) {
          setMinConfidenceScore(resHeartbeat.data.min_confidence_score);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMode = async () => {
    setIsTogglingMode(true);
    const nextMode = operatingMode === 'auto_dispatch' ? 'manual_review' : 'auto_dispatch';
    try {
      const res = await apiFetch('/api/worker/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operating_mode: nextMode, min_confidence_score: minConfidenceScore }),
      });
      const data = await res.json();
      if (data.success) {
        setOperatingMode(nextMode);
        setActionNotice(`Đã chuyển sang: ${nextMode === 'auto_dispatch' ? `Tự động gửi (Độ khớp ≥ ${minConfidenceScore}%)` : 'Duyệt tay trước khi gửi'}`);
      } else {
        alert('Lỗi: ' + (data.error || 'Không thể đổi chế độ'));
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setIsTogglingMode(false);
    }
  };

  const handleApproveAndComment = async (post: FacebookPost, commentText?: string) => {
    if (dispatchingId) return;
    const textToSend = commentText || post.classification?.suggested_comment_text;
    if (!textToSend) {
      alert('Vui lòng nhập nội dung bình luận!');
      return;
    }

    setDispatchingId(post.id);
    setActionNotice(null);

    try {
      const res = await apiFetch(`/api/posts/${post.id}/comment`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment_content: textToSend,
          operator_name: 'Marketing Maison MIPA',
          is_manual_assisted: false,
          post_url: post.post_url,
          author_name: post.author_name,
          content_raw: post.content_raw,
          group_id: post.group_id,
          group_name: post.group_name,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActionNotice(`Đã gửi bình luận tiếp cận và chuyển khách hàng "${post.author_name}" vào Pipeline CSKH.`);
        setEditingPost(null);
        fetchPosts();
      } else {
        if (data.needsAuth) {
          setAuthErrorModal({
            open: true,
            message: data.error || 'Chưa phát hiện phiên đăng nhập Facebook thực tế.',
            post,
          });
        } else {
          alert('Không thể bình luận: ' + data.error);
        }
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setDispatchingId(null);
    }
  };

  const handleManualAssistedSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPost || isSubmittingManual) return;

    setIsSubmittingManual(true);
    try {
      const text = manualPost.classification?.suggested_comment_text || 'Đã tiếp cận thủ công';
      const res = await apiFetch(`/api/posts/${manualPost.id}/comment`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment_content: text,
          operator_name: 'Nhân viên Marketing',
          is_manual_assisted: true,
          manual_proof_url: manualLink,
          post_url: manualPost.post_url,
          author_name: manualPost.author_name,
          content_raw: manualPost.content_raw,
          group_id: manualPost.group_id,
          group_name: manualPost.group_name,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActionNotice(`Đã ghi nhận tiếp cận thủ công cho bài "${manualPost.author_name}" và tạo hồ sơ CRM.`);
        setManualPost(null);
        setAuthErrorModal(null);
        setManualLink('');
        fetchPosts();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const filteredPosts = posts.filter((p) => {
    const intent = p.classification?.intent;
    const review = p.classification?.review_status;
    const isContacted = p.interaction?.status === 'sent_confirmed' || p.interaction?.status === 'manual_assisted';

    if (filterTab === 'looking') return intent === 'looking_for_service';
    if (filterTab === 'pending') return review === 'pending_review' && !isContacted;
    if (filterTab === 'commented') return isContacted;
    if (filterTab === 'dismissed') return review === 'dismissed' || intent === 'selling' || intent === 'recruiting' || intent === 'spam';
    return true;
  });

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-[#11141c] border border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
            <MessageSquareCheck className="w-5 h-5 text-amber-500" />
            <span>Hàng Chờ Phân Loại & Duyệt Tiếp Cận</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Phân loại bài viết theo nhu cầu • Trích xuất gói dịch vụ, khu vực, thời gian • Duyệt mẫu tiếp cận chuẩn giá niêm yết
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleMode}
            disabled={isTogglingMode}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all shadow-md ${
              operatingMode === 'auto_dispatch'
                ? 'bg-cyan-600 hover:bg-cyan-500 text-white border border-cyan-400/40 shadow-cyan-900/30'
                : 'bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/30'
            }`}
            title="Bấm để bật/tắt nhanh chế độ tự động gửi tiếp cận (Ngưỡng phù hợp ≥ 80%)"
          >
            <span>
              {operatingMode === 'auto_dispatch'
                ? `⚡ TỰ ĐỘNG GỬI (ĐỘ KHỚP ≥ ${minConfidenceScore}%)`
                : `✋ DUYỆT TAY TRƯỚC (≥ ${minConfidenceScore}%)`}
            </span>
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-xs text-zinc-400 hover:text-white px-2 py-0.5 rounded">
            Đóng
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 pb-3">
        {[
          { key: 'looking', label: 'Khách Cần Chụp', count: posts.filter(p => p.classification?.intent === 'looking_for_service').length },
          { key: 'pending', label: 'Chờ Duyệt Tiếp Cận', count: posts.filter(p => p.classification?.review_status === 'pending_review' && p.interaction?.status !== 'sent_confirmed').length },
          { key: 'commented', label: 'Đã Tiếp Cận', count: posts.filter(p => p.interaction?.status === 'sent_confirmed' || p.interaction?.status === 'manual_assisted').length },
          { key: 'dismissed', label: 'Đã Lọc (Rao Bán / Tuyển Thợ)', count: posts.filter(p => p.classification?.review_status === 'dismissed' || p.classification?.intent === 'selling' || p.classification?.intent === 'recruiting').length },
          { key: 'all', label: 'Tất Cả Bài Quét', count: posts.length },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center space-x-1.5 ${
              filterTab === tab.key
                ? 'bg-amber-600 text-white font-semibold'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filterTab === tab.key ? 'bg-amber-700 text-white' : 'bg-zinc-800 text-zinc-400'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Posts Feed Cards */}
      <div className="space-y-4">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 glass-card rounded-xl text-xs">
            Không có bài viết nào trong danh mục này.
          </div>
        ) : (
          filteredPosts.map((post) => {
            const cls = post.classification;
            const isContacted = post.interaction?.status === 'sent_confirmed' || post.interaction?.status === 'manual_assisted';
            const isManual = post.interaction?.status === 'manual_assisted';
            const isUncertain = post.interaction?.status === 'uncertain_failed';
            const isDispatching = dispatchingId === post.id;

            return (
              <div 
                key={post.id}
                className="p-4 sm:p-5 rounded-xl glass-card space-y-3.5 transition-all"
              >
                {/* Top Row: Author, Group, Date, Post Link */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-semibold text-white text-sm">{post.author_name}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-xs text-zinc-400">{post.group_name}</span>
                  </div>

                  <div className="flex items-center space-x-3 text-xs">
                    <span className="text-zinc-500 text-[11px]">
                      {new Date(post.posted_at).toLocaleTimeString('vi-VN')} {new Date(post.posted_at).toLocaleDateString('vi-VN')}
                    </span>
                    <a
                      href={post.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 hover:text-amber-300 flex items-center space-x-1 text-xs font-medium"
                    >
                      <span>Xem trên FB</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Raw Post Content */}
                <div className="p-3.5 rounded-lg bg-[#0e1118] border border-zinc-800/80 text-xs sm:text-sm text-zinc-200 leading-relaxed space-y-3">
                  <p className="italic">"{post.content_raw}"</p>

                  {/* Post Images Preview */}
                  {(post.media_preview_url || (post.image_urls && post.image_urls.length > 0)) && (
                    <div className="pt-2 border-t border-zinc-800/50">
                      <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-amber-400 mb-2">
                        <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                        <span>Hình ảnh đính kèm ({post.image_urls?.length || 1}):</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {(post.image_urls && post.image_urls.length > 0 ? post.image_urls : [post.media_preview_url!]).map((imgUrl, imgIdx) => (
                          <a
                            key={imgIdx}
                            href={imgUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="relative rounded-lg overflow-hidden border border-zinc-800/80 bg-zinc-950 group aspect-video sm:aspect-auto sm:h-44 transition-all duration-200 hover:border-amber-500/50 shadow-md block"
                            title="Bấm để mở ảnh gốc đầy đủ"
                          >
                            <img
                              src={getSafeImageUrl(imgUrl)}
                              alt={`Ảnh đính kèm ${imgIdx + 1}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                if (!target.src.includes('/api/proxy-image')) {
                                  target.src = `/api/proxy-image?url=${encodeURIComponent(imgUrl)}`;
                                } else {
                                  (e.target as HTMLElement).style.display = 'none';
                                }
                              }}
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium space-x-1 backdrop-blur-[2px]">
                              <ImageIcon className="w-4 h-4 text-amber-300" />
                              <span>Mở ảnh gốc</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Structured Extraction Entity Boxes - Equal Sizes */}
                {cls && (
                  <div className="p-3.5 rounded-lg bg-zinc-900/60 border border-zinc-800/80 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-1.5 text-zinc-300 font-semibold">
                        <Tag className="w-3.5 h-3.5 text-amber-500" />
                        <span>Thông Tin Phân Loại Nhu Cầu</span>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                        Độ phù hợp: {cls.confidence_score}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="p-2 rounded bg-[#0b0d13] border border-zinc-800">
                        <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Ý định</span>
                        <strong className="text-white text-xs truncate block mt-0.5">
                          {cls.intent === 'looking_for_service' ? 'Tìm dịch vụ chụp ảnh' : cls.intent === 'selling' ? 'Rao bán / Sang nhượng' : cls.intent === 'recruiting' ? 'Tuyển dụng / Tìm mẫu' : 'Chưa rõ nhu cầu'}
                        </strong>
                      </div>

                      <div className="p-2 rounded bg-[#0b0d13] border border-zinc-800">
                        <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Dịch vụ</span>
                        <strong className="text-amber-400 text-xs truncate block mt-0.5">{cls.service_detected || 'Chưa xác định'}</strong>
                      </div>

                      <div className="p-2 rounded bg-[#0b0d13] border border-zinc-800">
                        <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Khu vực</span>
                        <strong className="text-white text-xs truncate block mt-0.5">{cls.location || 'TP. Hồ Chí Minh'}</strong>
                      </div>

                      <div className="p-2 rounded bg-[#0b0d13] border border-zinc-800">
                        <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Quy mô & Lịch</span>
                        <strong className="text-white text-xs truncate block mt-0.5">
                          {cls.pax ? `${cls.pax} người` : 'Chưa rõ'} • {cls.shooting_date_text || 'Theo hẹn'}
                        </strong>
                      </div>
                    </div>

                    {cls.extra_requirements?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-xs pt-1">
                        <span className="text-zinc-400 text-[11px]">Yêu cầu:</span>
                        {cls.extra_requirements.map((req, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[11px] font-medium border border-zinc-700/60">
                            {req}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-[11px] text-zinc-400 italic pt-0.5">
                      Lý do: {cls.classification_reason}
                    </div>
                  </div>
                )}

                {/* Suggested Comment & Dispatch Actions */}
                {cls?.suggested_comment_text && !isContacted && (
                  <div className="p-3.5 rounded-lg bg-amber-950/20 border border-amber-500/20 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-300">Nội dung bình luận đề xuất:</span>
                      <span className="text-zinc-400 text-[11px]">Đã lấy giá niêm yết chuẩn</span>
                    </div>

                    <div className="p-2.5 rounded bg-zinc-900 border border-zinc-800 text-xs text-zinc-200">
                      {cls.suggested_comment_text}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => {
                          setEditingPost(post);
                          setCustomComment(cls.suggested_comment_text || '');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors flex items-center space-x-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Sửa nội dung</span>
                      </button>

                      <button
                        onClick={() => setManualPost(post)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors flex items-center space-x-1"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Duyệt thủ công (Tay)</span>
                      </button>

                      <button
                        onClick={() => handleApproveAndComment(post)}
                        disabled={isDispatching}
                        className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors flex items-center space-x-1.5 disabled:opacity-50 shadow-sm"
                      >
                        <Send className={`w-3.5 h-3.5 ${isDispatching ? 'animate-spin' : ''}`} />
                        <span>{isDispatching ? 'Đang gửi...' : 'Duyệt & Đăng Page'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Status Footnote if Contacted */}
                {isContacted && (
                  <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        {isManual ? 'Đã ghi nhận tiếp cận thủ công.' : 'Bình luận đã gửi thành công trên Facebook.'} Người xử lý: <strong>{post.interaction?.operator_name}</strong>
                      </span>
                    </div>
                    {post.interaction?.comment_permalink && (
                      <a 
                        href={post.interaction.comment_permalink} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-amber-400 hover:underline flex items-center text-xs font-medium"
                      >
                        Xem bình luận <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    )}
                  </div>
                )}

                {/* Uncertain Warning Box */}
                {isUncertain && (
                  <div className="p-3 rounded-lg bg-rose-950/20 border border-rose-500/30 text-xs text-rose-300 flex items-start justify-between gap-2">
                    <div className="flex items-start space-x-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block">Chưa xác định kết quả bình luận:</strong>
                        <p className="text-[11px] text-zinc-300">{post.interaction?.error_message}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setManualPost(post)}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-white text-[11px] font-medium shrink-0"
                    >
                      Xác nhận thủ công
                    </button>
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

      {/* Edit Custom Comment Modal */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12151e] border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-bold text-white">Chỉnh Sửa Bình Luận Tiếp Cận</h2>
              <button onClick={() => setEditingPost(null)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Khách hàng:</label>
                <div className="p-2.5 rounded bg-zinc-900 text-white font-medium">
                  {editingPost.author_name} ({editingPost.group_name})
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Nội dung bình luận:</label>
                <textarea
                  rows={4}
                  value={customComment}
                  onChange={(e) => setCustomComment(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setEditingPost(null)}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Hủy
              </button>
              <button
                onClick={() => handleApproveAndComment(editingPost, customComment)}
                disabled={Boolean(dispatchingId)}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold disabled:opacity-50"
              >
                {dispatchingId === editingPost.id ? 'Đang gửi...' : 'Duyệt & Đăng'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Assisted Modal */}
      {manualPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <form onSubmit={handleManualAssistedSubmit} className="bg-[#12151e] border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-bold text-white">Xác Nhận Đã Tiếp Cận Thủ Công</h2>
              <button type="button" onClick={() => setManualPost(null)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Dành cho nhân viên đã vào Facebook bình luận trực tiếp bằng tài khoản hoặc khi tự động gặp lỗi.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Bài viết:</label>
                <a href={manualPost.post_url} target="_blank" rel="noreferrer" className="text-amber-400 hover:underline flex items-center space-x-1">
                  <span className="truncate">{manualPost.post_url}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Link bình luận hoặc ghi chú bằng chứng (Tùy chọn):</label>
                <input
                  type="text"
                  placeholder="https://facebook.com/... hoặc Đã nhắn tin trực tiếp"
                  value={manualLink}
                  onChange={(e) => setManualLink(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setManualPost(null)}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSubmittingManual}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50"
              >
                {isSubmittingManual ? 'Đang xác nhận...' : 'Xác Nhận & Chuyển CSKH'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Session Required Warning Modal */}
      {authErrorModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12151e] border border-amber-500/40 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2.5 text-amber-400 border-b border-zinc-800 pb-3">
              <ShieldAlert className="w-5 h-5 shrink-0" />
              <h2 className="text-sm font-bold text-white">Yêu Cầu Phiên Đăng Nhập Facebook</h2>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              {authErrorModal.message}
            </p>

            <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 text-xs space-y-1 text-zinc-400">
              <div>• Xuất storageState từ trình duyệt và đặt vào: <code className="text-amber-400">data/auth/facebook_storage_state.json</code></div>
              <div>• Hoặc chọn <strong>"Tiếp cận thủ công"</strong> để trực tiếp thao tác trên trình duyệt của bạn.</div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setAuthErrorModal(null)}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Đóng
              </button>
              {authErrorModal.post && (
                <button
                  onClick={() => {
                    const target = authErrorModal.post!;
                    setAuthErrorModal(null);
                    setManualPost(target);
                  }}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold"
                >
                  Tiếp Cận Thủ Công Ngay
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
