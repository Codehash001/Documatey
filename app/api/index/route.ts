import { NextRequest, NextResponse } from 'next/server';
import { chunkText, fetchAndExtractText, normalizeWhitespace, crawlSite } from '@/lib/chunk';
import { embedTexts } from '@/lib/embed';
import { ensureSchema, upsertChunks } from '@/lib/tidb';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hash(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 48);
}

function batch<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url, text } = body as { url?: string; text?: string };

    if (!url && !text) {
      return NextResponse.json({ error: 'Provide either url or text' }, { status: 400 });
    }

    await ensureSchema();

    if (url) {
      // Crawl the site on the same host within limits
      const crawlRes = await crawlSite(url);
      if (!crawlRes.length) {
        return NextResponse.json({ error: 'No crawlable pages found' }, { status: 400 });
      }

      // Build chunks for each page
      const pageChunks: { pageUrl: string; chunk: string; idx: number }[] = [];
      for (const page of crawlRes) {
        const chunks = chunkText(normalizeWhitespace(page.text), { chunkSize: 1200, overlap: 200 });
        chunks.forEach((c, i) => pageChunks.push({ pageUrl: page.url, chunk: c, idx: i }));
      }

      if (!pageChunks.length) {
        return NextResponse.json({ error: 'No content to index after crawling' }, { status: 400 });
      }

      // Embed in batches to avoid payload limits
      const vectors: number[][] = [];
      for (const group of batch(pageChunks.map((pc) => pc.chunk), 64)) {
        const emb = await embedTexts(group);
        vectors.push(...emb);
      }

      // Upsert in batches
      const docs = pageChunks.map((pc, i) => ({
        source_url: pc.pageUrl,
        chunk_id: hash(`${pc.pageUrl}#${pc.idx}-${pc.chunk.slice(0, 32)}`),
        content: pc.chunk,
        embedding: vectors[i],
      }));

      for (const group of batch(docs, 200)) {
        await upsertChunks(group);
      }

      return NextResponse.json({
        message: 'Indexed successfully',
        pages: crawlRes.length,
        chunks: docs.length,
        source: 'url_crawl',
      });
    }

    // Raw text flow
    let sourceText = text ?? '';
    sourceText = normalizeWhitespace(sourceText);
    if (!sourceText) {
      return NextResponse.json({ error: 'No content to index' }, { status: 400 });
    }

    const chunks = chunkText(sourceText, { chunkSize: 1200, overlap: 200 });
    const embeddings = await embedTexts(chunks);

    const docs = chunks.map((c, i) => ({
      source_url: undefined as string | undefined,
      chunk_id: hash(`text-${i}-${c.slice(0, 32)}`),
      content: c,
      embedding: embeddings[i],
    }));

    await upsertChunks(docs);

    return NextResponse.json({
      message: 'Indexed successfully',
      chunks: docs.length,
      source: 'text',
    });
  } catch (err: any) {
    console.error('Indexing error:', err);
    return NextResponse.json({ error: String(err?.sqlMessage || err?.message || err) }, { status: 500 });
  }
}
