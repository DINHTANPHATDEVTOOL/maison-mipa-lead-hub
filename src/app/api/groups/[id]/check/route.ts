import { NextResponse } from 'next/server';
import { store } from '@/lib/store';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const result = store.triggerGroupCheck(params.id);
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.message }, { status: 404 });
  }
  return NextResponse.json({ success: true, message: result.message, group: result.group });
}
