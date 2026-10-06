import { NextResponse } from 'next/server';
import { leadRepo } from '@/lib/repositories/lead.repository';
import { store } from '@/lib/store';
import { verifyAuth } from '@/lib/auth';
import { formatLeadsToCsv } from '@/lib/csv';
import { CRMLead } from '@/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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
