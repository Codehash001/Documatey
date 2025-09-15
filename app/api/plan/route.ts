import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/lib/search';
import { getGeminiModel } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PLAN_SYSTEM = `You are an expert AI assistant that generates an actionable, precise implementation plan using the provided documentation snippets.
Requirements:
- Use only the provided documentation snippets as sources of truth.
- Prefer content that matches the user's target stack; avoid citing off-topic stacks (e.g., do not cite Python docs for a Next.js/TypeScript plan).
- Only cite sources from the allowed domains when provided.
- Each step's "detail" MUST be GitHub‑flavored Markdown (GFM) and include fenced code blocks (e.g., \`\`\`bash ... \`\`\`) where relevant. Use headings, lists, and inline code to improve readability.
- Provide citations for EACH step as objects with the URL and a short evidence snippet from the provided context.
Return STRICTLY valid JSON with this shape (no extra properties):
{
  "assumptions": string[],
  "steps": [
    { "id": string, "title": string, "detail": string, "check": string, "estimated_time_min": number, "citations": [ { "url": string, "evidence": string } ] }
  ],
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
  // prefer hosts whose name appears in the hintText (goal/answers)
  const lower = hintText.toLowerCase();
  let bestHost = '';
  let bestScore = -1;
  for (const [host, cnt] of counts) {
    const name = host.split('.').slice(-2, -1)[0] || host; // e.g., nextjs.org -> nextjs
    const bias = lower.includes(name) ? 2 : 1; // simple bias
    const score = cnt * bias;
    if (score > bestScore) { bestScore = score; bestHost = host; }
  }
  // apply only if there is a reasonably clear winner
  return bestScore > 0 ? bestHost : '';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { goal, answers, topK = 10 } = body as {
      goal?: string;
      answers?: Record<string, string>;
      topK?: number;
    };
    if (!goal) return NextResponse.json({ error: 'goal is required' }, { status: 400 });

    const contextLines = Object.entries(answers || {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    const retrievalQuery = `${goal}\n\nConstraints & choices:\n${contextLines}`.trim();

    // Initial retrieval
    const initial = await semanticSearch(retrievalQuery, Number(topK) || 10);

    // Agentically infer dominant host for citations
    const dominantHost = inferDominantHost(initial, `${goal}\n${contextLines}`);
    const filteredResults = dominantHost
      ? initial.filter((r) => (r.source_url || '').includes(`://${dominantHost}`))
      : initial;

    const contextText = filteredResults
      .map((r, i) => `[#${i + 1}] URL: ${r.source_url || 'n/a'}\n${r.content}\n`)
      .join('\n---\n');

    const allowedDomainsNote = dominantHost
      ? `Allowed sources: ${dominantHost}`
      : 'Allowed sources: (any of the provided snippets)';

    const model = getGeminiModel();
    const res = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: PLAN_SYSTEM }] },
        { role: 'user', parts: [{ text: `GOAL:\n${goal}` }] },
        { role: 'user', parts: [{ text: `ASSUMED/PROVIDED ANSWERS:\n${contextLines || '(none)'}\n` }] },
        { role: 'user', parts: [{ text: `${allowedDomainsNote}` }] },
        { role: 'user', parts: [{ text: `DOC CONTEXT (cite by URL):\n${contextText || '(no matching context found)'}` }] },
      ],
      generationConfig: { responseMimeType: 'application/json' } as any,
    } as any);

    const text = res.response?.text?.() || '';
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* salvage later */ }
    if (!json?.steps) {
      return NextResponse.json({ steps: [], citations: [], assumptions: [], note: contextText ? undefined : 'No matching context found for the inferred domain.' });
    }
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
