'use client';

import React, { useState, useEffect } from 'react';
import { Layers, Plus, Edit2, CheckCircle2, ShieldAlert, ShieldCheck, X, FileCheck } from 'lucide-react';
import { ServiceItem, OutreachTemplate } from '@/types';
import { apiFetch } from '@/lib/api-client';

export default function ServicesTemplatesPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<'services' | 'templates'>('services');
  const [isLoading, setIsLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<OutreachTemplate | null>(null);
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Template Form
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateContent, setTemplateContent] = useState('');

  // Service Form
  const [serviceName, setServiceName] = useState('');
  const [serviceBasePrice, setServiceBasePrice] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [servicePosingSupport, setServicePosingSupport] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [resS, resT] = await Promise.all([
        apiFetch('/api/services').then(r => r.json()),
        apiFetch('/api/templates').then(r => r.json()),
      ]);
      if (resS.success) setServices(resS.data);
      if (resT.success) setTemplates(resT.data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenEditTemplate = (tpl: OutreachTemplate) => {
    setEditingTemplate(tpl);
    setTemplateTitle(tpl.title);
    setTemplateContent(tpl.template_content);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;

    try {
      const res = await apiFetch('/api/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingTemplate.id,
          title: templateTitle,
          template_content: templateContent,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setEditingTemplate(null);
        setNotice('Đã cập nhật mẫu bình luận và tăng phiên bản.');
        fetchData();
      } else {
        alert(data.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  };

  const handleOpenEditService = (srv: ServiceItem) => {
    setEditingService(srv);
    setServiceName(srv.name);
    setServiceBasePrice(srv.base_price.toString());
    setServiceArea(srv.service_area);
    setServicePosingSupport(srv.includes_posing_support);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService) return;

    try {
      const res = await apiFetch('/api/services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingService.id,
          name: serviceName,
          base_price: parseFloat(serviceBasePrice),
          service_area: serviceArea,
          includes_posing_support: servicePosingSupport,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setEditingService(null);
        setNotice('Đã cập nhật bảng dịch vụ Maison MIPA.');
        fetchData();
      } else {
        alert(data.error);
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    }
  };

  return (
    <div className="space-y-5">

      {/* Header Banner - Uniform Standard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-[#11141c] border border-zinc-800">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2">
            <Layers className="w-5 h-5 text-amber-500" />
            <span>Bảng Dịch Vụ & Mẫu Tiếp Cận Chuẩn</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Quy định giá niêm yết, điều kiện dịch vụ và các mẫu tiếp cận đã duyệt • Đảm bảo báo giá chính xác, minh bạch
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-lg p-1 text-xs self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('services')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'services'
                ? 'bg-amber-600 text-white font-semibold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Bảng Dịch Vụ ({services.length})
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'templates'
                ? 'bg-amber-600 text-white font-semibold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Mẫu Tiếp Cận ({templates.length})
          </button>
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

      {/* Services Tab Content */}
      {activeTab === 'services' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          {services.map((srv) => (
            <div 
              key={srv.id}
              className="p-4 rounded-xl glass-card space-y-3 hover:border-zinc-700 transition-all flex flex-col justify-between h-full"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2 min-h-[36px]">
                  <span className="font-bold text-white text-sm">{srv.name}</span>
                  <span className="text-xs px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-bold border border-amber-500/20 shrink-0">
                    {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(srv.base_price)}
                  </span>
                </div>

                <div className="text-xs text-zinc-400 space-y-1.5 p-3 rounded-lg bg-[#0e1118] border border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span>Khu vực phục vụ:</span>
                    <strong className="text-zinc-200">{srv.service_area}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Ghi chú gói:</span>
                    <span className="text-zinc-300 italic">{srv.price_note}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Hỗ trợ tạo dáng:</span>
                    <span className={srv.includes_posing_support ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                      {srv.includes_posing_support ? '✓ Có stylist chỉ dẫn tận tình' : '✕ Tự túc'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">Mã gói: {srv.code}</span>
                <button
                  onClick={() => handleOpenEditService(srv)}
                  className="h-8 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors flex items-center space-x-1"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Sửa thông tin</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Templates Tab Content */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-xs text-zinc-300 flex items-center space-x-2.5">
            <FileCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="leading-relaxed">
              <strong>Nguyên tắc mẫu tiếp cận:</strong> Nội dung bình luận chỉ được lấy giá từ Bảng dịch vụ niêm yết đã duyệt. Khi bài viết thiếu điều kiện hoặc ngoài khu vực, hệ thống sẽ đưa vào danh sách chờ xem lại để CSKH xử lý trực tiếp.
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
            {templates.map((tpl) => {
              const matchedService = services.find(s => s.id === tpl.service_id);

              return (
                <div 
                  key={tpl.id}
                  className="p-4 rounded-xl glass-card space-y-3 hover:border-zinc-700 transition-all flex flex-col justify-between h-full"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2 min-h-[32px]">
                      <span className="font-bold text-white text-xs sm:text-sm">{tpl.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 shrink-0 font-medium">
                        v{tpl.version}
                      </span>
                    </div>

                    <div className="text-xs text-amber-400 font-medium">
                      Áp dụng: {matchedService?.name || 'Chung'}
                    </div>

                    <div className="p-2.5 rounded-lg bg-[#0e1118] border border-zinc-800 text-xs text-zinc-300 leading-relaxed italic min-h-[80px]">
                      "{tpl.template_content}"
                    </div>

                    <div className="flex flex-wrap items-center gap-1 pt-1 text-[10px]">
                      <span className="text-zinc-500">Biến:</span>
                      {tpl.allowed_placeholders.map((ph, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-300 font-mono">
                          {ph}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Duyệt: {tpl.updated_by_name}</span>
                    <button
                      onClick={() => handleOpenEditTemplate(tpl)}
                      className="h-8 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors flex items-center space-x-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Sửa mẫu</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit Template Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12151e] border border-zinc-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-bold text-white">Chỉnh Sửa Mẫu Bình Luận Tiếp Cận</h2>
              <button onClick={() => setEditingTemplate(null)} className="p-1 rounded-lg text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">Tiêu Đề Mẫu</label>
                <input
                  type="text"
                  required
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Nội Dung Mẫu (Bao gồm các biến {`{gia}`}, {`{khu_vuc}`})</label>
                <textarea
                  rows={4}
                  required
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500 leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingTemplate(null)}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  Lưu & Tăng Phiên Bản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Service Modal */}
      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12151e] border border-zinc-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-sm font-bold text-white">Chỉnh Sửa Gói Dịch Vụ: {editingService.name}</h2>
              <button onClick={() => setEditingService(null)} className="p-1 rounded-lg text-zinc-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveService} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-zinc-300 font-medium mb-1">Tên Dịch Vụ</label>
                <input
                  type="text"
                  required
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Giá Cơ Sở (VND)</label>
                <input
                  type="number"
                  step="50000"
                  required
                  value={serviceBasePrice}
                  onChange={(e) => setServiceBasePrice(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Khu Vực Phục Vụ</label>
                <input
                  type="text"
                  required
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="posing"
                  checked={servicePosingSupport}
                  onChange={(e) => setServicePosingSupport(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="posing" className="text-zinc-300">
                  Gói có stylist hỗ trợ hướng dẫn tạo dáng chi tiết cho khách
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow-sm transition-colors"
                >
                  Lưu Gói Dịch Vụ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
