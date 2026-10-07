'use client';

import React, { useState, useEffect } from 'react';
import { 
  Layers, Plus, Edit2, CheckCircle2, X, FileCheck, Trash2, 
  Sparkles, Tag, Eye, Heart, MessageCircle, Info, User, Users,
  Check, AlertCircle
} from 'lucide-react';
import { ServiceItem, OutreachTemplate } from '@/types';
import { apiFetch } from '@/lib/api-client';

const PLACEHOLDERS = [
  { tag: '{ten_khach}', desc: 'Tên khách / Đại từ ("bạn", "2 bạn")' },
  { tag: '{gia}', desc: 'Giá cơ sở theo gói dịch vụ (ví dụ: 990.000 ₫)' },
  { tag: '{ten_dich_vu}', desc: 'Tên gói dịch vụ được nhận diện' },
  { tag: '{khu_vuc}', desc: 'Khu vực chụp (Quận / TP. Hồ Chí Minh)' },
  { tag: '{ho_tro_tao_dang}', desc: 'Câu hỗ trợ tạo dáng nếu có' },
];

export default function ServicesTemplatesPage() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<'services' | 'templates'>('templates');
  const [selectedServiceFilter, setSelectedServiceFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Template Modal (Create / Edit)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OutreachTemplate | null>(null);
  const [templateServiceId, setTemplateServiceId] = useState('');
  const [templateTitle, setTemplateTitle] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [templateIsApproved, setTemplateIsApproved] = useState(true);

  // Service Modal
  const [editingService, setEditingService] = useState<ServiceItem | null>(null);
  const [serviceName, setServiceName] = useState('');
  const [serviceBasePrice, setServiceBasePrice] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [servicePosingSupport, setServicePosingSupport] = useState(true);
  const [servicePriceNote, setServicePriceNote] = useState('');

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
      if (resS.success) {
        setServices(resS.data);
        if (!templateServiceId && resS.data.length > 0) {
          setTemplateServiceId(resS.data[0].id);
        }
      }
      if (resT.success) setTemplates(resT.data);
    } catch (e) {
      console.error('Fetch data error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenCreateTemplate = (preselectedServiceId?: string) => {
    setEditingTemplate(null);
    setTemplateTitle('');
    setTemplateContent('');
    setTemplateIsApproved(true);
    setTemplateServiceId(preselectedServiceId || (services.length > 0 ? services[0].id : 'srv-01'));
    setIsTemplateModalOpen(true);
  };

  const handleOpenEditTemplate = (tpl: OutreachTemplate) => {
    setEditingTemplate(tpl);
    setTemplateTitle(tpl.title);
    setTemplateContent(tpl.template_content);
    setTemplateServiceId(tpl.service_id);
    setTemplateIsApproved(tpl.is_approved);
    setIsTemplateModalOpen(true);
  };

  const handleInsertPlaceholder = (ph: string) => {
    setTemplateContent(prev => {
      const textarea = document.getElementById('template-textarea') as HTMLTextAreaElement | null;
      if (!textarea) return prev + ' ' + ph;
      const start = textarea.selectionStart || prev.length;
      const end = textarea.selectionEnd || prev.length;
      const nextContent = prev.substring(0, start) + ph + prev.substring(end);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + ph.length, start + ph.length);
      }, 0);
      return nextContent;
    });
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!templateTitle.trim() || !templateContent.trim() || !templateServiceId) {
      alert('Vui lòng điền đầy đủ tiêu đề, phân loại dịch vụ và nội dung kịch bản.');
      return;
    }

    setIsSaving(true);
    try {
      if (editingTemplate) {
        // Update existing template
        const res = await apiFetch('/api/templates', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingTemplate.id,
            service_id: templateServiceId,
            title: templateTitle,
            template_content: templateContent,
            is_approved: templateIsApproved,
            version: editingTemplate.version,
          }),
        });

        const data = await res.json();
        if (res.status === 409 || data.conflict) {
          alert('Xung đột phiên bản (OCC Conflict): Kịch bản này vừa được sửa đổi bởi người khác. Vui lòng thử lại.');
          setIsTemplateModalOpen(false);
          fetchData();
          return;
        }

        if (data.success) {
          setIsTemplateModalOpen(false);
          setNotice(`Đã cập nhật kịch bản "${templateTitle}" thành công!`);
          fetchData();
        } else {
          alert(data.error || 'Lỗi lưu kịch bản');
        }
      } else {
        // Create new template
        const res = await apiFetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: templateServiceId,
            title: templateTitle,
            template_content: templateContent,
            is_approved: templateIsApproved,
          }),
        });

        const data = await res.json();
        if (data.success) {
          setIsTemplateModalOpen(false);
          setNotice(`Đã tạo mới kịch bản "${templateTitle}" thành công!`);
          fetchData();
        } else {
          alert(data.error || 'Lỗi thêm mới kịch bản');
        }
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (tpl: OutreachTemplate) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa kịch bản "${tpl.title}" không?`)) {
      return;
    }

    try {
      const res = await apiFetch(`/api/templates?id=${tpl.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setNotice(`Đã xóa kịch bản "${tpl.title}".`);
        fetchData();
      } else {
        alert(data.error || 'Không thể xóa kịch bản');
      }
    } catch (e: any) {
      alert('Lỗi xóa: ' + e.message);
    }
  };

  const handleOpenEditService = (srv: ServiceItem) => {
    setEditingService(srv);
    setServiceName(srv.name);
    setServiceBasePrice(srv.base_price.toString());
    setServiceArea(srv.service_area);
    setServicePriceNote(srv.price_note || '');
    setServicePosingSupport(srv.includes_posing_support);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingService || isSaving) return;

    setIsSaving(true);
    try {
      const res = await apiFetch('/api/services', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingService.id,
          name: serviceName,
          base_price: parseFloat(serviceBasePrice),
          service_area: serviceArea,
          price_note: servicePriceNote,
          includes_posing_support: servicePosingSupport,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setEditingService(null);
        setNotice(`Đã cập nhật gói dịch vụ "${serviceName}".`);
        fetchData();
      } else {
        alert(data.error || 'Lỗi lưu dịch vụ');
      }
    } catch (e: any) {
      alert('Lỗi: ' + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Preview helper
  const selectedServiceForPreview = services.find(s => s.id === templateServiceId) || services[0];
  const renderSimulatedComment = (content: string, service?: ServiceItem) => {
    if (!content) return 'Nội dung bình luận mẫu sẽ hiển thị tại đây...';
    const srv = service || selectedServiceForPreview;
    const formattedPrice = srv 
      ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(srv.base_price) 
      : '990.000 ₫';
    
    return content
      .replace(/{gia}/g, formattedPrice)
      .replace(/{khu_vuc}/g, srv?.service_area?.split('(')[0]?.trim() || 'TP. Hồ Chí Minh')
      .replace(/{ho_tro_tao_dang}/g, srv?.includes_posing_support ? 'có stylist hướng dẫn tạo dáng chi tiết' : '')
      .replace(/{ten_dich_vu}/g, srv?.name || 'Chụp ảnh chuyên nghiệp')
      .replace(/{ten_khach}/g, srv?.code === 'COUPLE' ? '2 bạn' : 'bạn');
  };

  // Filter templates
  const filteredTemplates = templates.filter(t => {
    if (selectedServiceFilter === 'all') return true;
    return t.service_id === selectedServiceFilter;
  });

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#11141c] border border-zinc-800 shadow-xl">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center space-x-2.5">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Layers className="w-5 h-5" />
            </span>
            <span>Quản Lý Kịch Bản Phân Loại Theo Dịch Vụ</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Phân loại kịch bản cho từng dịch vụ: Cá nhân (Tốt nghiệp), Couple, Áo dài, Kỷ yếu nhóm, Cưới hỏi... Tự động nhận diện ngữ cảnh và báo giá chuẩn xác.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 text-xs">
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'templates'
                  ? 'bg-amber-600 text-white font-semibold shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Kịch Bản Tiếp Cận ({templates.length})
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={`px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'services'
                  ? 'bg-amber-600 text-white font-semibold shadow'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Bảng Giá Dịch Vụ ({services.length})
            </button>
          </div>

          {activeTab === 'templates' && (
            <button
              onClick={() => handleOpenCreateTemplate()}
              className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 text-xs font-bold transition-all shadow-lg flex items-center space-x-1.5 shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Thêm Kịch Bản</span>
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{notice}</span>
          </div>
          <button onClick={() => setNotice(null)} className="text-xs text-zinc-400 hover:text-white px-2 py-0.5 rounded">
            Đóng
          </button>
        </div>
      )}

      {/* AI Classifier Architecture Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/30 via-zinc-900 to-zinc-900 border border-amber-500/20 text-xs text-zinc-300 space-y-2.5 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-amber-400 font-bold">
            <Sparkles className="w-4 h-4" />
            <span>Cơ Chế Nhận Diện Ngữ Cảnh & Tự Động Định Giá:</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium">
            AI Classifier v2.0
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1 text-[11px]">
          <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800">
            <div className="text-amber-300 font-semibold flex items-center space-x-1 mb-1">
              <User className="w-3.5 h-3.5" />
              <span>Cá nhân / Tốt nghiệp</span>
            </div>
            <p className="text-zinc-400 text-[10px] leading-relaxed">
              Khách nói: <span className="text-zinc-200">"em cần chụp tốt nghiệp"</span>, "1 mình", "nàng thơ" ➔ Tự quy vào <strong className="text-emerald-400">Gói Cá Nhân (990k)</strong>.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800">
            <div className="text-amber-300 font-semibold flex items-center space-x-1 mb-1">
              <Heart className="w-3.5 h-3.5" />
              <span>Couple / Cặp đôi</span>
            </div>
            <p className="text-zinc-400 text-[10px] leading-relaxed">
              Khách nói: <span className="text-zinc-200">"couple"</span>, "2 đứa", "người yêu", "bạn gái" ➔ Tự quy vào <strong className="text-emerald-400">Gói Couple (1.500k)</strong>, pax = 2.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800">
            <div className="text-amber-300 font-semibold flex items-center space-x-1 mb-1">
              <Users className="w-3.5 h-3.5" />
              <span>Kỷ yếu nhóm / Lớp</span>
            </div>
            <p className="text-zinc-400 text-[10px] leading-relaxed">
              Khách nói: <span className="text-zinc-200">"kỷ yếu"</span>, "cả lớp", "nhóm bạn", "tập thể" ➔ Tự quy vào <strong className="text-emerald-400">Kỷ yếu nhóm (2.500k)</strong>.
            </p>
          </div>

          <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800">
            <div className="text-amber-300 font-semibold flex items-center space-x-1 mb-1">
              <Tag className="w-3.5 h-3.5" />
              <span>Áo dài / Cưới / Gia đình</span>
            </div>
            <p className="text-zinc-400 text-[10px] leading-relaxed">
              Áo dài ➔ <strong className="text-emerald-400">1.200k</strong>; Phóng sự cưới ➔ <strong className="text-emerald-400">3.500k</strong>; Gia đình ➔ <strong className="text-emerald-400">2.200k</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div className="space-y-4">

          {/* Service Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedServiceFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                selectedServiceFilter === 'all'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              Tất Cả ({templates.length})
            </button>

            {services.map(srv => {
              const count = templates.filter(t => t.service_id === srv.id).length;
              return (
                <button
                  key={srv.id}
                  onClick={() => setSelectedServiceFilter(srv.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center space-x-1.5 ${
                    selectedServiceFilter === srv.id
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                >
                  <span>{srv.name.split('/')[0].trim()}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    selectedServiceFilter === srv.id ? 'bg-amber-400/30 text-amber-200' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
            {filteredTemplates.map((tpl) => {
              const matchedService = services.find(s => s.id === tpl.service_id);
              const formattedPrice = matchedService 
                ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(matchedService.base_price)
                : 'Chưa niêm yết';

              return (
                <div 
                  key={tpl.id}
                  className="p-4 rounded-2xl glass-card space-y-3 hover:border-zinc-700 transition-all flex flex-col justify-between h-full group"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2 min-h-[32px]">
                      <span className="font-bold text-white text-xs sm:text-sm line-clamp-2">{tpl.title}</span>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        {tpl.is_approved ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                            Đã duyệt
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-medium">
                            Chờ duyệt
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-medium">
                          v{tpl.version}
                        </span>
                      </div>
                    </div>

                    {/* Service Tag & Price */}
                    <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
                      <span className="text-amber-400 font-semibold truncate">
                        {matchedService?.name || 'Gói Chung'}
                      </span>
                      <span className="text-zinc-200 font-bold shrink-0 ml-2">
                        {formattedPrice}
                      </span>
                    </div>

                    {/* Content Preview */}
                    <div className="p-3 rounded-xl bg-[#0e1118] border border-zinc-800 text-xs text-zinc-300 leading-relaxed italic min-h-[90px]">
                      "{tpl.template_content}"
                    </div>

                    {/* Placeholders badge */}
                    <div className="flex flex-wrap items-center gap-1 pt-1 text-[10px]">
                      <span className="text-zinc-500">Biến:</span>
                      {tpl.allowed_placeholders.map((ph, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded-md bg-zinc-800/80 text-amber-300/90 font-mono text-[9px] border border-zinc-700/50">
                          {ph}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
                    <span className="truncate max-w-[140px]">Duyệt: {tpl.updated_by_name}</span>
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleDeleteTemplate(tpl)}
                        className="h-8 w-8 rounded-lg bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-500/30 transition-colors flex items-center justify-center"
                        title="Xóa kịch bản"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenEditTemplate(tpl)}
                        className="h-8 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors flex items-center space-x-1"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Sửa kịch bản</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredTemplates.length === 0 && (
              <div className="col-span-full p-12 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800 text-zinc-400 space-y-3">
                <FileCheck className="w-8 h-8 mx-auto text-zinc-600" />
                <p className="text-sm">Chưa có kịch bản nào cho phân loại dịch vụ này.</p>
                <button
                  onClick={() => handleOpenCreateTemplate(selectedServiceFilter !== 'all' ? selectedServiceFilter : undefined)}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold inline-flex items-center space-x-1.5 shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>Tạo kịch bản cho dịch vụ này</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Services Tab */}
      {activeTab === 'services' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
            {services.map((srv) => (
              <div 
                key={srv.id}
                className="p-4 rounded-2xl glass-card space-y-3 hover:border-zinc-700 transition-all flex flex-col justify-between h-full"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2 min-h-[36px]">
                    <span className="font-bold text-white text-sm">{srv.name}</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-300 font-bold border border-amber-500/20 shrink-0">
                      {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(srv.base_price)}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-400 space-y-1.5 p-3 rounded-xl bg-[#0e1118] border border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span>Khu vực phục vụ:</span>
                      <strong className="text-zinc-200">{srv.service_area}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Ghi chú gói:</span>
                      <span className="text-zinc-300 italic">{srv.price_note || 'Chưa có ghi chú'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Hỗ trợ tạo dáng:</span>
                      <span className={srv.includes_posing_support ? 'text-emerald-400 font-semibold' : 'text-zinc-500'}>
                        {srv.includes_posing_support ? '✓ Có stylist chỉ dẫn tận tình' : '✕ Tự túc'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2.5 border-t border-zinc-800 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500 font-mono">Code: {srv.code}</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setActiveTab('templates');
                        setSelectedServiceFilter(srv.id);
                      }}
                      className="h-8 px-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-zinc-800 transition-colors"
                    >
                      Xem kịch bản ({templates.filter(t => t.service_id === srv.id).length})
                    </button>
                    <button
                      onClick={() => handleOpenEditService(srv)}
                      className="h-8 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition-colors flex items-center space-x-1"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Sửa giá</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Template Modal (Create / Edit) with Live Preview */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12151e] border border-zinc-800 rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3.5">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>{editingTemplate ? 'Chỉnh Sửa Kịch Bản Tiếp Cận' : 'Tạo Mới Kịch Bản Phân Loại Dịch Vụ'}</span>
                </h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Thiết lập mẫu câu phản hồi tự động tương ứng theo từng gói dịch vụ.
                </p>
              </div>
              <button 
                onClick={() => setIsTemplateModalOpen(false)} 
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-4 text-xs">
              
              {/* Service Selection */}
              <div>
                <label className="block text-zinc-300 font-semibold mb-1.5">
                  Phân Loại Gói Dịch Vụ Áp Dụng <span className="text-rose-400">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {services.map(srv => {
                    const isSelected = templateServiceId === srv.id;
                    return (
                      <button
                        type="button"
                        key={srv.id}
                        onClick={() => setTemplateServiceId(srv.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500 text-white shadow'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        <div className="font-bold text-[11px] truncate flex items-center justify-between">
                          <span>{srv.name.split('/')[0].trim()}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-1" />}
                        </div>
                        <div className="text-[10px] text-amber-400/90 font-medium mt-1">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(srv.base_price)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-zinc-300 font-semibold mb-1">
                  Tiêu Đề Kịch Bản <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Mẫu báo giá Couple 2 đứa lãng mạn"
                  value={templateTitle}
                  onChange={(e) => setTemplateTitle(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* Template Content & Insert Tags */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-zinc-300 font-semibold">
                    Nội Dung Kịch Bản <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[10px] text-zinc-400">Click phím tắt bên dưới để chèn biến:</span>
                </div>

                {/* Placeholder chips */}
                <div className="flex flex-wrap items-center gap-1.5 pb-1">
                  {PLACEHOLDERS.map((p) => (
                    <button
                      type="button"
                      key={p.tag}
                      onClick={() => handleInsertPlaceholder(p.tag)}
                      className="px-2 py-1 rounded-lg bg-zinc-800/90 hover:bg-amber-600 hover:text-white border border-zinc-700 text-amber-300 font-mono text-[10px] transition-all flex items-center space-x-1"
                      title={p.desc}
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>{p.tag}</span>
                    </button>
                  ))}
                </div>

                <textarea
                  id="template-textarea"
                  rows={4}
                  required
                  placeholder="Chào {ten_khach} nha! Maison MIPA có gói chụp tại {khu_vuc} giá chỉ từ {gia} ({ho_tro_tao_dang})..."
                  value={templateContent}
                  onChange={(e) => setTemplateContent(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500 leading-relaxed font-sans"
                />
              </div>

              {/* Live Preview of Comment */}
              <div className="p-3.5 rounded-xl bg-gradient-to-b from-[#0e1118] to-zinc-950 border border-zinc-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 border-b border-zinc-800/80 pb-2">
                  <div className="flex items-center space-x-1.5 text-amber-400 font-semibold">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Xem Trước Bình Luận Thực Tế (Live Preview):</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">
                    Gói: {selectedServiceForPreview?.name.split('/')[0]}
                  </span>
                </div>

                {/* Simulated Facebook Comment */}
                <div className="flex items-start space-x-2.5 pt-1">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center text-zinc-950 font-bold text-xs shrink-0 shadow">
                    DP
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-zinc-200 text-xs leading-relaxed">
                      <div className="font-bold text-amber-300 text-[11px] mb-1">
                        Dinh Tan Phat (Maison MIPA Studio)
                      </div>
                      <p className="whitespace-pre-wrap">
                        {renderSimulatedComment(templateContent, selectedServiceForPreview)}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3 text-[10px] text-zinc-500 pl-2">
                      <span className="hover:underline cursor-pointer">Thích</span>
                      <span className="hover:underline cursor-pointer">Phản hồi</span>
                      <span>Vừa xong</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Approval status */}
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="tpl-approved"
                  checked={templateIsApproved}
                  onChange={(e) => setTemplateIsApproved(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-900 text-amber-600 focus:ring-amber-500 h-4 w-4"
                />
                <label htmlFor="tpl-approved" className="text-zinc-300 text-xs">
                  Duyệt kịch bản này để hệ thống tự động bình luận khi bắt gặp khách hàng phù hợp
                </label>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 text-xs font-bold shadow-lg transition-all disabled:opacity-50"
                >
                  {isSaving ? 'Đang lưu...' : (editingTemplate ? 'Lưu & Tăng Phiên Bản' : 'Tạo Kịch Bản Mới')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Service Modal */}
      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#12151e] border border-zinc-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl">
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
                  className="w-full h-9 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Giá Cơ Sở Niêm Yết (VND)</label>
                <input
                  type="number"
                  step="50000"
                  required
                  value={serviceBasePrice}
                  onChange={(e) => setServiceBasePrice(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500 font-bold"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Khu Vực Phục Vụ</label>
                <input
                  type="text"
                  required
                  value={serviceArea}
                  onChange={(e) => setServiceArea(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-zinc-300 font-medium mb-1">Ghi Chú Gói (Quyền lợi, số lượng ảnh)</label>
                <input
                  type="text"
                  value={servicePriceNote}
                  onChange={(e) => setServicePriceNote(e.target.value)}
                  placeholder="Gói 2 người, tặng kèm makeup nữ, chỉnh sửa 20 ảnh..."
                  className="w-full h-9 px-3 rounded-xl bg-zinc-900 border border-zinc-800 text-white text-xs focus:outline-none focus:border-amber-500"
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

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="px-3.5 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold shadow transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Đang lưu...' : 'Lưu Gói Dịch Vụ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
