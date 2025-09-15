import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/lib/search';
import { getGeminiModel } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM = `You are a helpful developer assistant. Answer user questions and help troubleshoot errors using ONLY the provided context snippets.
Rules:
- If the user's tech stack is evident (e.g., Next.js/TypeScript), avoid giving examples from other stacks (e.g., Python) unless requested.
- Prefer concise, actionable answers with minimal but necessary steps.
- When relevant, include code blocks and reference links.
- Always include citations to the most relevant sources from the provided snippets.
Return strictly valid JSON with this shape:
{
  "answer": string,
  "citations": [ { "url": string, "evidence": string } ]
}`;

function getHost(u?: string | null) {
  try { return u ? new URL(u).host : ''; } catch { return ''; }
}

function inferDominantHost(results: { source_url: string | null }[], hintText: string) {
  const counts = new Map<string, number>();
  for (const r of results) {
    const host = getHost(r.source_url);
    if (!host) continue;
    counts.set(host, (counts.get(host) || 0) + 1);
  }
  const lower = hintText.toLowerCase();
  let bestHost = '';
  let bestScore = -1;
  for (const [host, cnt] of counts) {
    const name = host.split('.').slice(-2, -1)[0] || host;
    const bias = lower.includes(name) ? 2 : 1;
    const score = cnt * bias;
    if (score > bestScore) { bestScore = score; bestHost = host; }
  }
  return bestScore > 0 ? bestHost : '';
}

function buildContext(snippets: { source_url: string | null; content: string }[]) {
  return snippets
    .map((r, i) => `[#${i + 1}] URL: ${r.source_url || 'n/a'}\n${r.content}`)
    .join('\n---\n');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, topK = 8, filters, history } = body as {
      message?: string;
      topK?: number;
      filters?: { sourceHost?: string; sourcePrefix?: string };
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    };
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    const historyText = Array.isArray(history)
      ? history.slice(-4).map((h) => `${h.role.toUpperCase()}: ${h.content}`).join('\n')
      : '';
    const retrievalQuery = [historyText, `USER: ${message}`].filter(Boolean).join('\n');

    const initial = await semanticSearch(retrievalQuery, Number(topK) || 8, filters);

    // Agentic domain selection when filters not provided
    let results = initial;
    if (!filters?.sourceHost && !filters?.sourcePrefix) {
      const dominantHost = inferDominantHost(initial, retrievalQuery);
      if (dominantHost) {
        results = initial.filter((r) => (r.source_url || '').includes(`://${dominantHost}`));
      }
    }

    const contextText = buildContext(results);

    const model = getGeminiModel();
    const res = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: SYSTEM }] },
        ...(history ? history.map((h) => ({ role: h.role, parts: [{ text: h.content }] }) as any) : []),
        { role: 'user', parts: [{ text: `CONTEXT:\n${contextText || '(no matching context)'}` }] },
        { role: 'user', parts: [{ text: `QUESTION:\n${message}` }] },
      ],
      generationConfig: { responseMimeType: 'application/json' } as any,
    } as any);

    const text = res.response?.text?.() || '';
    let json: any = null;
    try { json = JSON.parse(text); } catch {}
    if (!json?.answer) {
      return NextResponse.json({ answer: 'Sorry, I could not find a precise answer from the provided context.', citations: [] });
    }
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
