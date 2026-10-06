import { NextResponse } from 'next/server';
import { leadRepo } from '@/lib/repositories/lead.repository';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';
import { CRMLead } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Escape cell content for CSV and defend against CSV Formula Injection.
 * In Excel/Sheets, cells starting with =, +, -, @, \t, \r can trigger formula execution.
 * Prepend a single quote (') to neutralize the formula while preserving readable text.
 */
export function sanitizeCsvCell(value: any): string {
  if (value === null || value === undefined) return '""';
  let str = String(value);

  // CSV Formula Injection Guard
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Escape double quotes by doubling them
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export function formatLeadsToCsv(leads: CRMLead[]): string {
  const headers = [
    'Mã Lead',
    'Tên Khách Hàng',
    'Facebook URL',
    'Dịch Vụ Quan Tâm',
    'Giai Đoạn CRM',
    'Giá Báo (VND)',
    'Lịch Chụp Dự Kiến',
    'CSKH Phụ Trách',
    'Ghi Chú',
    'Ngày Tạo'
  ];

  const stageLabels: Record<string, string> = {
    uncontacted: 'Chưa phản hồi',
    replied: 'Có phản hồi',
    consulting: 'Đang tư vấn',
    quoted: 'Đã báo giá',
    booked: 'Đã đặt lịch',
    lost: 'Hủy / Thất bại',
  };

  const rows = leads.map(l => [
    sanitizeCsvCell(l.id),
    sanitizeCsvCell(l.customer_name),
    sanitizeCsvCell(l.customer_facebook_url),
    sanitizeCsvCell(l.service_interest),
    sanitizeCsvCell(stageLabels[l.stage] || l.stage),
    sanitizeCsvCell(l.quoted_amount ? l.quoted_amount.toLocaleString('vi-VN') : ''),
    sanitizeCsvCell(l.booking_date || ''),
    sanitizeCsvCell(l.assigned_cskh_name || ''),
    sanitizeCsvCell(l.notes || ''),
    sanitizeCsvCell(l.created_at || ''),
  ].join(','));

  const headerRow = headers.map(h => sanitizeCsvCell(h)).join(',');
  // \uFEFF is UTF-8 Byte Order Mark (BOM), required for Microsoft Excel to correctly render UTF-8 Vietnamese accents
  return `\uFEFF${headerRow}\r\n${rows.join('\r\n')}`;
}

export async function GET(req: Request) {
  // 1. RBAC Check: Only admin and cskh can export CRM leads
  const auth = verifyAuth(req, ['admin', 'cskh']);
  if (!auth.success) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage') || undefined;

    let leads: CRMLead[] = [];
    try {
      leads = await leadRepo.getAll({ stage });
    } catch {
      leads = store.getLeads().filter(l => !stage || l.stage === stage);
    }

    const csvContent = formatLeadsToCsv(leads);
    const filename = `maison_mipa_leads_${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
