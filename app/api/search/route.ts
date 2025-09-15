import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/lib/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, topK = 8, filters } = body as {
      query?: string;
      topK?: number;
      filters?: { sourceHost?: string; sourcePrefix?: string };
    };
    if (!query) return NextResponse.json({ error: 'query is required' }, { status: 400 });

    const results = await semanticSearch(query, Number(topK) || 8, filters);
    return NextResponse.json({ results });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
