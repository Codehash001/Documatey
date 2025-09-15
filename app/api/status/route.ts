import { NextRequest, NextResponse } from 'next/server';
import { ensureSchema, pool, TABLE_NAME } from '@/lib/tidb';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    await ensureSchema();
    const [rows] = await pool.query(`SELECT COUNT(*) AS cnt FROM ${TABLE_NAME}`);
    const cnt = Array.isArray(rows) && rows.length ? Number((rows as any)[0].cnt) : 0;
    return NextResponse.json({ count: cnt });
  } catch (err: any) {
    return NextResponse.json({ count: 0, error: String(err?.message || err) }, { status: 200 });
  }
}
