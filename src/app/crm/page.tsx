'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  ExternalLink, 
  Calendar, 
  DollarSign, 
  MessageSquare, 
  CheckCircle2, 
  Clock, 
  Edit2, 
  Plus, 
  X,
  ChevronRight,
  UserCheck,
  List,
  Kanban,
  Download
} from 'lucide-react';
import { CRMLead, CRMStage } from '@/types';
import { apiFetch } from '@/lib/api-client';

const STAGES: { key: CRMStage; label: string; color: string; bg: string; desc: string }[] = [
  { key: 'uncontacted', label: 'Chưa phản hồi', color: 'text-zinc-400', bg: 'bg-zinc-800', desc: 'Đã gửi tiếp cận, đang chờ khách nhắn lại' },
  { key: 'replied', label: 'Có phản hồi', color: 'text-blue-400', bg: 'bg-blue-500/20', desc: 'Khách đã reply comment hoặc nhắn Page' },
  { key: 'consulting', label: 'Đang tư vấn', color: 'text-amber-400', bg: 'bg-amber-500/20', desc: 'CSKH đang trao đổi concept, layout' },
  { key: 'quoted', label: 'Đã báo giá', color: 'text-purple-400', bg: 'bg-purple-500/20', desc: 'Đã gửi báo giá gói chụp chính xác' },
  { key: 'booked', label: 'Đã chốt lịch', color: 'text-emerald-400', bg: 'bg-emerald-500/20', desc: 'Khách đã đặt cọc / chốt ngày giờ' },
  { key: 'lost', label: 'Hủy / Chưa chốt', color: 'text-rose-400', bg: 'bg-rose-500/20', desc: 'Khách không phù hợp hoặc đổi ý' },
];

export default function CRMPage() {
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedLead, setSelectedLead] = useState<CRMLead | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

  // Edit form states
  const [stage, setStage] = useState<CRMStage>('uncontacted');
  const [notes, setNotes] = useState('');
  const [quotedAmount, setQuotedAmount] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [assignedStaff, setAssignedStaff] = useState('');

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/leads');
      const data = await res.json();
      if (data.success) {
        setLeads(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const res = await apiFetch('/api/leads/export');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Xuất CSV thất bại');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `maison_mipa_leads_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setNotice('Đã xuất danh sách khách hàng CRM thành công dưới định dạng CSV.');
    } catch (err: any) {
      alert('Lỗi xuất CSV: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const openEditModal = (lead: CRMLead) => {
    setSelectedLead(lead);
    setStage(lead.stage);
    setNotes(lead.notes || '');
    setQuotedAmount(lead.quoted_amount ? lead.quoted_amount.toString() : '');
    setBookingDate(lead.booking_date ? lead.booking_date.slice(0, 16) : '');
    setAssignedStaff(lead.assigned_cskh_name || 'Nguyễn Ngọc Lan');
    setIsEditing(true);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || isSaving) return;

    setIsSaving(true);
    try {
      const res = await apiFetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedLead.id,
          stage,
          notes,
          quoted_amount: quotedAmount ? parseFloat(quotedAmount) : null,
          booking_date: bookingDate ? new Date(bookingDate).toISOString() : null,
          assigned_cskh_name: assignedStaff,
          version: (selectedLead as any).version,
        }),
      });

      const data = await res.json();
      if (res.status === 409 || data.conflict) {
        alert('Xung đột phiên bản (OCC Conflict): Hồ sơ khách hàng này vừa được cập nhật bởi một nhân viên khác. Hệ thống sẽ tải lại dữ liệu mới nhất.');
        setIsEditing(false);
        fetchLeads();
        return;
      }

      if (data.success) {
        setIsEditing(false);
        setNotice(`Đã cập nhật hồ sơ khách hàng "${selectedLead.customer_name}".`);
        fetchLeads();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-[#11141c] border border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Users className="w-5 h-5 text-amber-500" />
            <span>Đường Ống Chăm Sóc Khách Hàng (CRM Pipeline)</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Quản trị tiến trình chuyển đổi: Tiếp cận ➔ Phản hồi ➔ Tư vấn ➔ Báo giá ➔ Chốt lịch chụp Maison MIPA
          </p>
        </div>

        {/* View mode toggle & Export button */}
        <div className="flex items-center space-x-2 self-start sm:self-auto">
          <button
            onClick={handleExportCsv}
            disabled={isExporting}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-xs font-medium transition-colors disabled:opacity-50"
          >
            <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-spin' : ''}`} />
            <span>{isExporting ? 'Đang xuất...' : 'Xuất CSV'}</span>
          </button>

          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1 text-xs">
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === 'kanban'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Dạng Bảng Cột</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                viewMode === 'table'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Dạng Danh Sách</span>
            </button>
          </div>
        </div>
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

      {/* Stage Summary Counter Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {STAGES.map((s) => {
          const count = leads.filter(l => l.stage === s.key).length;
          return (
            <div key={s.key} className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800/80 text-xs space-y-1">
              <span className="text-zinc-400 block text-[11px] truncate font-medium">{s.label}</span>
              <div className="text-lg font-bold text-white">{count}</div>
            </div>
          );
        })}
      </div>

      {/* VIEW MODE 1: KANBAN BOARD */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 items-start">
          {STAGES.map((col) => {
            const colLeads = leads.filter(l => l.stage === col.key);

            return (
              <div 
                key={col.key}
                className="p-3 rounded-xl bg-[#11141c] border border-zinc-800/80 flex flex-col space-y-2.5 min-h-[460px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <span className="font-semibold text-xs text-zinc-200 truncate">
                    {col.label}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 font-semibold">
                    {colLeads.length}
                  </span>
                </div>

                {/* Cards in Column */}
                <div className="space-y-2 flex-1">
                  {colLeads.length === 0 ? (
                    <div className="text-center py-8 text-[11px] text-zinc-600 border border-dashed border-zinc-800/80 rounded-lg">
                      Trống
                    </div>
                  ) : (
                    colLeads.map((lead) => (
                      <div
                        key={lead.id}
                        onClick={() => openEditModal(lead)}
                        className="p-3 rounded-lg glass-card border border-zinc-800/80 hover:border-amber-500/40 cursor-pointer transition-all space-y-1.5 group shadow-sm text-xs"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="font-semibold text-white text-xs group-hover:text-amber-300 transition-colors line-clamp-1">
                            {lead.customer_name}
                          </span>
                          <Edit2 className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 shrink-0 mt-0.5" />
                        </div>

                        <div className="text-[11px] text-amber-400 font-medium truncate">
                          {lead.service_interest}
                        </div>

                        {lead.post_summary && (
                          <p className="text-[10px] text-zinc-400 line-clamp-2 italic leading-tight">
                            "{lead.post_summary}"
                          </p>
                        )}

                        {lead.quoted_amount && (
                          <div className="text-[11px] text-emerald-400 font-semibold">
                            {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(lead.quoted_amount)}
                          </div>
                        )}

                        {lead.booking_date && (
                          <div className="text-[10px] text-cyan-300 flex items-center space-x-1">
                            <Calendar className="w-2.5 h-2.5" />
                            <span>{new Date(lead.booking_date).toLocaleDateString('vi-VN')}</span>
                          </div>
                        )}

                        <div className="pt-1.5 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
                          <span className="truncate">{lead.assigned_cskh_name}</span>
                          <span>{new Date(lead.created_at).toLocaleDateString('vi-VN')}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE 2: DATA TABLE */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-[#11141c]">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] font-semibold">
              <tr>
                <th className="py-3 px-4">Khách Hàng</th>
                <th className="py-3 px-4">Dịch Vụ Quan Tâm</th>
                <th className="py-3 px-4">Giai Đoạn</th>
                <th className="py-3 px-4">Báo Giá</th>
                <th className="py-3 px-4">Lịch Hẹn</th>
                <th className="py-3 px-4">Phụ Trách</th>
                <th className="py-3 px-4">Ngày Tạo</th>
                <th className="py-3 px-4 text-right">Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-300">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500">Chưa có hồ sơ khách hàng nào trong hệ thống.</td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const stageObj = STAGES.find(s => s.key === lead.stage);
                  return (
                    <tr key={lead.id} className="hover:bg-zinc-900/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-white">
                        <div>{lead.customer_name}</div>
                        {lead.customer_facebook_url && (
                          <a href={lead.customer_facebook_url} target="_blank" rel="noreferrer" className="text-[11px] text-amber-400 hover:underline flex items-center space-x-1 mt-0.5">
                            <span className="truncate max-w-[180px]">Xem bài viết</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </td>
                      <td className="py-3 px-4 text-amber-300 font-medium">{lead.service_interest}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${stageObj?.bg} ${stageObj?.color}`}>
                          {stageObj?.label || lead.stage}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-emerald-400">
                        {lead.quoted_amount ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(lead.quoted_amount) : '—'}
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        {lead.booking_date ? new Date(lead.booking_date).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td className="py-3 px-4 text-zinc-400">{lead.assigned_cskh_name}</td>
                      <td className="py-3 px-4 text-zinc-500">{new Date(lead.created_at).toLocaleDateString('vi-VN')}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => openEditModal(lead)}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium"
                        >
                          Cập nhật
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Lead Modal */}
      {isEditing && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <form onSubmit={handleSaveLead} className="bg-[#12151e] border border-zinc-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-white">Chăm Sóc Khách Hàng: {selectedLead.customer_name}</h2>
                <span className="text-xs text-amber-400">Dịch vụ: {selectedLead.service_interest}</span>
              </div>
              <button type="button" onClick={() => setIsEditing(false)} className="text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Giai đoạn đường ống CSKH:</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as CRMStage)}
                  className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Báo giá gói chụp (VNĐ):</label>
                  <input
                    type="number"
                    placeholder="VD: 1200000"
                    value={quotedAmount}
                    onChange={(e) => setQuotedAmount(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 mb-1">Lịch chụp dự kiến:</label>
                  <input
                    type="datetime-local"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Nhân viên CSKH phụ trách:</label>
                <input
                  type="text"
                  value={assignedStaff}
                  onChange={(e) => setAssignedStaff(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Ghi chú tư vấn (yêu cầu layout, phong cách, thời gian):</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú chi tiết trao đổi với khách hàng..."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center space-x-1.5"
              >
                <span>{isSaving ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
