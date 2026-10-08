'use client';

import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  MessageSquare, 
  RefreshCw, 
  Sparkles, 
  Zap, 
  User, 
  ShieldCheck,
  Radio
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { DispatchedLogItem } from '@/app/api/worker/logs/route';

interface AutoOutreachLogViewerProps {
  title?: string;
  maxItems?: number;
  showTerminal?: boolean;
  compact?: boolean;
}

export default function AutoOutreachLogViewer({
  title = 'Nhật Ký Tự Động Tiếp Cận & Đăng Bình Luận',
  maxItems = 30,
  showTerminal = true,
  compact = false,
}: AutoOutreachLogViewerProps) {
  const [dispatchedLogs, setDispatchedLogs] = useState<DispatchedLogItem[]>([]);
  const [workerLogs, setWorkerLogs] = useState<string[]>([]);
  const [workerRunning, setWorkerRunning] = useState(false);
  const [operatingMode, setOperatingMode] = useState<'manual_review' | 'auto_dispatch'>('manual_review');
  const [minConfidenceScore, setMinConfidenceScore] = useState<number>(80);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dispatched' | 'terminal'>('dispatched');
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 4000);
    return () => clearInterval(interval);
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await apiFetch('/api/worker/logs');
      const data = await res.json();
      if (data.success && data.data) {
        setDispatchedLogs(data.data.dispatchedLogs || []);
        setWorkerLogs(data.data.workerLogs || []);
        setWorkerRunning(Boolean(data.data.workerRunning));
        setOperatingMode(data.data.operatingMode || 'manual_review');
        if (data.data.minConfidenceScore !== undefined) {
          setMinConfidenceScore(data.data.minConfidenceScore);
        }
        setLastRefreshed(new Date().toLocaleTimeString('vi-VN'));
      }
    } catch {}
  };

  const handleManualRefresh = async () => {
    setIsLoading(true);
    await fetchLogs();
    setIsLoading(false);
  };

  const formatTimestamp = (isoString?: string) => {
    if (!isoString) return '--:--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + 
        ' ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[#0b0e17] border border-zinc-800 space-y-4 shadow-xl">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">
              {title}
            </h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
              operatingMode === 'auto_dispatch' 
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' 
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}>
              {operatingMode === 'auto_dispatch' ? `Tự Động (≥${minConfidenceScore}%)` : 'Duyệt Tay'}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Lịch sử chi tiết: Bình luận bài viết nào, giờ nào, điểm độ khớp và nội dung đã gửi.
          </p>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto">
          {/* Tabs */}
          {showTerminal && (
            <div className="flex items-center bg-zinc-900 rounded-lg p-0.5 border border-zinc-800 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('dispatched')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  activeTab === 'dispatched' 
                    ? 'bg-cyan-600 text-white shadow-sm' 
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Bài Đã Đăng ({dispatchedLogs.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('terminal')}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  activeTab === 'terminal' 
                    ? 'bg-cyan-600 text-white shadow-sm' 
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Console Logs ({workerLogs.length})
              </button>
            </div>
          )}

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isLoading}
            title={`Làm mới (Tự động cập nhật mỗi 4s - Lần cuối: ${lastRefreshed})`}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'dispatched' ? (
        <div>
          {dispatchedLogs.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-zinc-900/40 border border-dashed border-zinc-800 space-y-2">
              <MessageSquare className="w-8 h-8 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-400 font-medium">
                Chưa có bài viết nào được đăng bình luận tiếp cận gần đây.
              </p>
              <p className="text-[11px] text-zinc-500">
                Khi chế độ Tự Động được bật và Worker phát hiện bài viết có độ phù hợp ≥ {minConfidenceScore}%, các bài đăng sẽ xuất hiện tại đây theo thời gian thực.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {dispatchedLogs.slice(0, maxItems).map((log) => (
                <div 
                  key={log.id}
                  className="p-3 sm:p-3.5 rounded-xl bg-[#0e121c] border border-zinc-800/90 hover:border-zinc-700 transition-all space-y-2"
                >
                  {/* Top row: Time + Author + Group + Mode Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="flex items-center space-x-1 text-emerald-400 font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Đã Bình Luận</span>
                      </span>
                      <span className="text-zinc-600">•</span>
                      <span className="flex items-center space-x-1 text-zinc-300 font-mono text-[11px]">
                        <Clock className="w-3 h-3 text-zinc-500" />
                        <span>{formatTimestamp(log.dispatched_at)}</span>
                      </span>
                      <span className="text-zinc-600">•</span>
                      <span className="font-semibold text-white">
                        {log.author_name}
                      </span>
                      <span className="text-zinc-400 text-[11px]">
                        ({log.group_name})
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {/* Score Badge */}
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/30">
                        Độ khớp: {log.confidence_score}%
                      </span>

                      {/* Auto vs Manual Badge */}
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        log.is_auto 
                          ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/30' 
                          : 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
                      }`}>
                        {log.is_auto ? '⚡ Tự Động' : '✋ Duyệt Tay'}
                      </span>

                      {/* Direct Post Link */}
                      {log.post_url && (
                        <a
                          href={log.post_url}
                          target="_blank"
                          rel="noreferrer"
                          title="Mở bài viết trên Facebook"
                          className="flex items-center space-x-1 text-[11px] text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/20"
                        >
                          <span>Mở bài</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Customer Post Excerpt */}
                  {log.content_raw && (
                    <div className="text-[11px] text-zinc-400 bg-zinc-900/60 p-2 rounded-lg border border-zinc-850 line-clamp-2">
                      <span className="text-zinc-500 font-semibold">Khách đăng: </span>
                      "{log.content_raw}"
                    </div>
                  )}

                  {/* Dispatched Comment Content */}
                  <div className="text-xs text-zinc-200 bg-cyan-950/20 border border-cyan-500/25 p-2.5 rounded-lg leading-relaxed">
                    <span className="text-cyan-400 font-semibold text-[11px] block mb-0.5">
                      💬 Nội dung tiếp cận đã gửi ({log.operator_name}):
                    </span>
                    <p className="italic">
                      "{log.comment_content}"
                    </p>
                    {log.comment_permalink && (
                      <div className="mt-1.5 pt-1.5 border-t border-cyan-500/20 flex items-center justify-between text-[10px]">
                        <span className="text-zinc-400">Liên kết bình luận đã xác nhận:</span>
                        <a 
                          href={log.comment_permalink} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-cyan-400 hover:underline flex items-center space-x-1 font-mono"
                        >
                          <span>Xem trên Facebook</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Console Terminal View */
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Tiến trình Worker Daemon: {workerRunning ? '🟢 Đang chạy' : '🔴 Chưa bật'}</span>
            <span className="font-mono text-[11px]">{workerLogs.length} dòng sự kiện</span>
          </div>
          <div className="h-72 overflow-y-auto font-mono text-[11px] text-emerald-400/90 bg-[#04060a] p-3 rounded-xl border border-zinc-900 space-y-1 leading-relaxed">
            {workerLogs.length === 0 ? (
              <div className="text-zinc-600 italic">Đang chờ sự kiện mới từ máy chủ Worker...</div>
            ) : (
              workerLogs.map((log, i) => (
                <div key={i} className="hover:bg-emerald-950/20 rounded px-1">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
