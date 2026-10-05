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
  UserCheck
} from 'lucide-react';
import { CRMLead, CRMStage } from '@/types';

const STAGES: { key: CRMStage; label: string; color: string; bg: string }[] = [
  { key: 'uncontacted', label: 'Chưa phản hồi', color: 'text-zinc-400', bg: 'bg-zinc-800' },
  { key: 'replied', label: 'Có phản hồi', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { key: 'consulting', label: 'Đang tư vấn', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  { key: 'quoted', label: 'Đã báo giá', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { key: 'booked', label: 'Đã chốt lịch hẹn', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  { key: 'lost', label: 'Không tiếp tục', color: 'text-rose-400', bg: 'bg-rose-500/20' },
];

export default function CRMPage() {
  const [leads, setLeads] = useState<CRMLead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<CRMLead | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Form states for edit
  const [stage, setStage] = useState<CRMStage>('consulting');
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
      const res = await fetch('/api/leads');
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

  const openEditModal = (lead: CRMLead) => {
    setSelectedLead(lead);
    setStage(lead.stage);
    setNotes(lead.notes || '');
    setQuotedAmount(lead.quoted_amount ? lead.quoted_amount.toString() : '');
    setBookingDate(lead.booking_date ? lead.booking_date.slice(0, 16) : '');
    setAssignedStaff(lead.assigned_cskh_name || 'Ngọc Lan (CSKH)');
    setIsEditing(true);
  };

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    try {
      const res = await fetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedLead.id,
          stage,
          notes,
          quoted_amount: quotedAmount ? parseFloat(quotedAmount) : null,
          booking_date: bookingDate ? new Date(bookingDate).toISOString() : null,
          assigned_cskh_name: assignedStaff,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setIsEditing(false);
        setNotice(`Đã cập nhật hồ sơ khách hàng "${selectedLead.customer_name}".`);
        fetchLeads();
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      alert('Lỗi: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Users className="w-6 h-6 text-brand-400" />
            <span>Pipeline Chăm Sóc Khách Hàng (CRM CSKH)</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Theo dõi từ bình luận tiếp cận ➔ phản hồi khách ➔ tư vấn ➔ báo giá ➔ chốt lịch chụp tại Maison MIPA.
          </p>
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-brand-500/15 border border-brand-500/30 text-amber-200 text-sm flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-xs text-zinc-400 hover:text-white">
            Đóng
          </button>
        </div>
      )}

      {/* Kanban Board Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4">
        {STAGES.map((col) => {
          const colLeads = leads.filter(l => l.stage === col.key);

          return (
            <div 
              key={col.key}
              className="p-3.5 rounded-2xl glass-panel border border-white/5 flex flex-col space-y-3 min-w-[240px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <div className="flex items-center space-x-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${col.bg}`} />
                  <span className="font-bold text-xs uppercase tracking-wider text-zinc-200">
                    {col.label}
                  </span>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-semibold">
                  {colLeads.length}
                </span>
              </div>

              {/* Cards in Column */}
              <div className="space-y-3 flex-1">
                {colLeads.length === 0 ? (
                  <div className="text-center py-8 text-[11px] text-zinc-600 border border-dashed border-white/5 rounded-xl">
                    Chưa có khách
                  </div>
                ) : (
                  colLeads.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => openEditModal(lead)}
                      className="p-3.5 rounded-xl glass-card border border-white/5 hover:border-brand-500/40 cursor-pointer transition-all space-y-2 group shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="font-bold text-sm text-white group-hover:text-amber-300 transition-colors">
                          {lead.customer_name}
                        </span>
                        <Edit2 className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
                      </div>

                      <div className="text-xs text-brand-300 font-medium">
                        {lead.service_interest}
                      </div>

                      {lead.post_summary && (
                        <p className="text-[11px] text-zinc-400 line-clamp-2 italic">
                          "{lead.post_summary}"
                        </p>
                      )}

                      {lead.quoted_amount && (
                        <div className="text-xs text-emerald-400 font-bold flex items-center space-x-1">
                          <span>Báo giá:</span>
                          <span>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(lead.quoted_amount)}</span>
                        </div>
                      )}

                      {lead.booking_date && (
                        <div className="text-[11px] text-cyan-300 flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>Lịch chụp: {new Date(lead.booking_date).toLocaleDateString('vi-VN')}</span>
                        </div>
                      )}

                      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-zinc-500">
                        <span>CSKH: {lead.assigned_cskh_name}</span>
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

      {/* Edit Lead Modal */}
      {isEditing && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#151923] border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-lg font-bold text-white">Chăm Sóc Khách Hàng: {selectedLead.customer_name}</h2>
                <span className="text-xs text-zinc-400">Quan tâm: {selectedLead.service_interest}</span>
              </div>
              <button onClick={() => setIsEditing(false)} className="p-1 rounded-lg text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLead} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">Trạng Thái Chăm Sóc (Stage)</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as CRMStage)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-brand-500"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Số Tiền Đã Báo Giá (VND)</label>
                  <input
                    type="number"
                    step="50000"
                    placeholder="Ví dụ: 1500000"
                    value={quotedAmount}
                    onChange={(e) => setQuotedAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-300 font-medium mb-1">Lịch Hẹn Chụp Dự Kiến</label>
                  <input
                    type="datetime-local"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Nhân Viên CSKH Phụ Trách</label>
                <input
                  type="text"
                  value={assignedStaff}
                  onChange={(e) => setAssignedStaff(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Ghi Chú Nhu Cầu & Tiến Độ Tư Vấn</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú sở thích tone màu, phụ phí ngoại cảnh, câu hỏi của khách..."
                  className="w-full px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-white text-xs focus:outline-none focus:border-brand-500 leading-relaxed"
                />
              </div>

              {selectedLead.customer_facebook_url && (
                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Bài viết nguồn gốc:</span>
                  <a
                    href={selectedLead.customer_facebook_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber-400 hover:underline flex items-center space-x-1"
                  >
                    <span>Mở link bài viết</span>
                    <ExternalLink className="w-3 h-3 ml-0.5" />
                  </a>
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-xl text-zinc-400 hover:text-white"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold shadow-md transition-all"
                >
                  Lưu Thông Tin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
