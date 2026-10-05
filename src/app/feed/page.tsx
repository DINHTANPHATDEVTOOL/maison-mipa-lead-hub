'use client';

import React, { useState, useEffect } from 'react';
import { 
  MessageSquareCheck, 
  Filter, 
  Send, 
  Edit3, 
  Trash2, 
  ExternalLink, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  HelpCircle,
  X,
  UserCheck,
  ChevronRight
} from 'lucide-react';
import { FacebookPost, PostIntent } from '@/types';

export default function FeedQueuePage() {
  const [posts, setPosts] = useState<FacebookPost[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'looking' | 'pending' | 'commented' | 'dismissed'>('looking');
  const [isLoading, setIsLoading] = useState(true);
  const [editingPost, setEditingPost] = useState<FacebookPost | null>(null);
  const [customComment, setCustomComment] = useState('');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/posts');
      const data = await res.json();
      if (data.success) {
        setPosts(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveAndComment = async (post: FacebookPost, commentText?: string) => {
    const textToSend = commentText || post.classification?.suggested_comment_text;
    if (!textToSend) {
      alert('Vui lòng nhập nội dung bình luận!');
      return;
    }

    setDispatchingId(post.id);
    setActionNotice(null);

    try {
      const res = await fetch(`/api/posts/${post.id}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment_content: textToSend,
          operator_name: 'Marketing Maison MIPA',
        }),
      });

      const data = await res.json();
      if (data.success) {
        setActionNotice(`Đã gửi bình luận tiếp cận và chuyển khách hàng "${post.author_name}" vào Pipeline CSKH.`);
        setEditingPost(null);
        fetchPosts();
      } else {
        alert(data.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setDispatchingId(null);
    }
  };

  const filteredPosts = posts.filter((p) => {
    const intent = p.classification?.intent;
    const review = p.classification?.review_status;
    const isContacted = p.interaction?.status === 'sent_confirmed';

    if (filterTab === 'looking') return intent === 'looking_for_service';
    if (filterTab === 'pending') return review === 'pending_review';
    if (filterTab === 'commented') return isContacted;
    if (filterTab === 'dismissed') return review === 'dismissed' || intent === 'selling' || intent === 'recruiting' || intent === 'spam';
    return true;
  });

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <MessageSquareCheck className="w-6 h-6 text-brand-400" />
            <span>Hàng Chờ Nhận Dạng & Tiếp Cận Bài Viết</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Phân loại khách cần chụp với người bán máy / tuyển thợ • Trích xuất thực thể • Duyệt mẫu tiếp cận chuẩn Maison MIPA.
          </p>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-amber-200 text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-xs text-zinc-400 hover:text-white">
            Đóng
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        {[
          { key: 'looking', label: 'Khách Cần Chụp (Có Nhu Cầu)' },
          { key: 'pending', label: 'Chờ Duyệt Gửi Mẫu' },
          { key: 'commented', label: 'Đã Tiếp Cận Xong' },
          { key: 'dismissed', label: 'Đã Lọc (Rao Bán / Tuyển Thợ / Spam)' },
          { key: 'all', label: 'Tất Cả Bài Quét' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterTab(tab.key as any)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
              filterTab === tab.key
                ? 'bg-brand-500 text-white shadow-md'
                : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Posts Feed Cards */}
      <div className="space-y-5">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-16 text-zinc-500 glass-card rounded-2xl">
            Không có bài viết nào trong mục này.
          </div>
        ) : (
          filteredPosts.map((post) => {
            const cls = post.classification;
            const isContacted = post.interaction?.status === 'sent_confirmed';
            const isDispatching = dispatchingId === post.id;

            return (
              <div 
                key={post.id}
                className="p-5 rounded-2xl glass-card border border-white/5 space-y-4 hover:border-brand-500/25 transition-all"
              >
                {/* Top Row: Author, Group, Date, Post Link */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white text-base">{post.author_name}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-xs text-zinc-400">{post.group_name}</span>
                  </div>

                  <div className="flex items-center space-x-3 text-xs">
                    <span className="text-zinc-500">
                      Đăng lúc: {new Date(post.posted_at).toLocaleTimeString('vi-VN')} {new Date(post.posted_at).toLocaleDateString('vi-VN')}
                    </span>
                    <a
                      href={post.post_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-amber-400 hover:text-amber-300 flex items-center space-x-1"
                    >
                      <span>Xem bài gốc</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Raw Post Content */}
                <div className="p-3.5 rounded-xl bg-zinc-900/70 border border-white/5 text-sm text-zinc-200 italic leading-relaxed">
                  "{post.content_raw}"
                </div>

                {/* Structured Extraction Entity Badges (Kịch bản mục 5) */}
                {cls && (
                  <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Sparkles className="w-4 h-4 text-brand-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-brand-300">
                          Kết Quả Nhận Dạng & Trích Xuất Thực Thể
                        </span>
                      </div>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/10 text-brand-300 border border-brand-500/20 font-semibold">
                        Độ tin cậy: {cls.confidence_score}%
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-2 rounded-lg bg-zinc-950/60 border border-white/5">
                        <span className="text-zinc-400 block text-[10px] uppercase">Ý định</span>
                        <strong className="text-white">
                          {cls.intent === 'looking_for_service' ? 'Tìm dịch vụ chụp ảnh' : cls.intent}
                        </strong>
                      </div>

                      <div className="p-2 rounded-lg bg-zinc-950/60 border border-white/5">
                        <span className="text-zinc-400 block text-[10px] uppercase">Dịch vụ</span>
                        <strong className="text-amber-300">{cls.service_detected || 'Chưa rõ'}</strong>
                      </div>

                      <div className="p-2 rounded-lg bg-zinc-950/60 border border-white/5">
                        <span className="text-zinc-400 block text-[10px] uppercase">Địa điểm</span>
                        <strong className="text-white">{cls.location || 'Chưa rõ'}</strong>
                      </div>

                      <div className="p-2 rounded-lg bg-zinc-950/60 border border-white/5">
                        <span className="text-zinc-400 block text-[10px] uppercase">Số người & Thời gian</span>
                        <strong className="text-white">
                          {cls.pax ? `${cls.pax} người` : 'Chưa rõ'} • {cls.shooting_date_text || 'Chưa rõ'}
                        </strong>
                      </div>
                    </div>

                    {cls.extra_requirements?.length > 0 && (
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-zinc-400">Yêu cầu thêm:</span>
                        {cls.extra_requirements.map((req, idx) => (
                          <span key={idx} className="px-2 py-0.5 rounded bg-brand-500/15 text-brand-300 border border-brand-500/20 font-medium">
                            ✨ {req}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="text-[11px] text-zinc-400 italic">
                      Lý do phân loại: {cls.classification_reason}
                    </div>
                  </div>
                )}

                {/* Suggested Comment & Dispatch Actions */}
                {cls?.suggested_comment_text && !isContacted && (
                  <div className="p-4 rounded-xl bg-brand-950/30 border border-brand-500/30 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-300">Mẫu Bình Luận Đã Khớp (Sẵn sàng gửi):</span>
                      <span className="text-zinc-400 text-[11px]">Đã điền tự động giá & điều kiện từ Bảng dịch vụ</span>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-900 border border-white/10 text-xs text-zinc-200">
                      {cls.suggested_comment_text}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                      <button
                        onClick={() => {
                          setEditingPost(post);
                          setCustomComment(cls.suggested_comment_text || '');
                        }}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors flex items-center space-x-1"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Chỉnh sửa nội dung</span>
                      </button>

                      <button
                        onClick={() => handleApproveAndComment(post)}
                        disabled={isDispatching}
                        className="px-4 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold shadow-md transition-all flex items-center space-x-1.5 disabled:opacity-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{isDispatching ? 'Đang gửi & Xác nhận...' : 'Duyệt & Đăng Bình Luận'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Already Contacted Badge & Info */}
                {isContacted && post.interaction && (
                  <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2 text-cyan-300 font-semibold">
                        <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                        <span>Đã gửi bình luận tiếp cận thành công (Được bảo vệ chống trùng lặp)</span>
                      </div>
                      <p className="text-zinc-300 text-[11px]">
                        Nội dung: "{post.interaction.comment_content}"
                      </p>
                    </div>

                    {post.interaction.comment_permalink && (
                      <a
                        href={post.interaction.comment_permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 font-medium shrink-0 ml-3"
                      >
                        Xem bình luận
                      </a>
                    )}
                  </div>
                )}

              </div>
            );
          })
        )}
      </div>

      {/* Edit Comment Modal */}
      {editingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#151923] border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-lg font-bold text-white">Chỉnh Sửa Bình Luận Tiếp Cận</h2>
              <button onClick={() => setEditingPost(null)} className="p-1 rounded-lg text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-zinc-400">
              Gửi bình luận đến bài viết của <strong className="text-white">{editingPost.author_name}</strong>
            </div>

            <textarea
              rows={4}
              value={customComment}
              onChange={(e) => setCustomComment(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-white text-sm focus:outline-none focus:border-brand-500 leading-relaxed"
            />

            <div className="p-3 rounded-xl bg-zinc-900 border border-white/5 text-[11px] text-zinc-400">
              ⚡ <strong>Chống trùng:</strong> Sau khi gửi thành công, hệ thống sẽ tự động khóa bài viết này để ngăn gửi lại và chuyển thẳng hồ sơ khách sang CRM.
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingPost(null)}
                className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleApproveAndComment(editingPost, customComment)}
                className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold shadow-md transition-all flex items-center space-x-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Xác Nhận & Gửi Ngay</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
