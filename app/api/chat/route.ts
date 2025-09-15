import { NextRequest, NextResponse } from 'next/server';
import { semanticSearch } from '@/lib/search';
import { getGeminiModel } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM = `You are a helpful developer assistant. Answer using ONLY the selected step's context and retrieved snippets.
Strict rules:
- STEP_DETAIL is the source of truth. Do not contradict it.
- Infer the technology stack from STEP_DETAIL and its citations; do not switch stacks unless explicitly asked.
- Provide the best possible, concise answer with actionable steps and code matching the inferred stack.
- Always include citations to sources used.
Return strictly valid JSON:
{
  "answer": string,
  "citations": [ { "url": string, "evidence": string } ]
}`;

function getHost(u?: string | null) {
  try { return u ? new URL(u).host : ''; } catch { return ''; }
}

function buildContext(snippets: { source_url: string | null; content: string }[]) {
  return snippets
    .map((r, i) => `[#${i + 1}] URL: ${r.source_url || 'n/a'}\n${r.content}`)
    .join('\n---\n');
}

// Gemini accepts roles: 'user' | 'model'. Map any 'assistant' history entries to 'model'.
function toGeminiRole(role: 'user' | 'assistant'): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      message,
      topK = 5,
      filters,
      history,
      stepId,
      stepDetail,
      stepCitations,
      assumptions,
      strict
    } = body as {
      message?: string;
      topK?: number;
      filters?: { sourceHost?: string; sourcePrefix?: string };
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      stepId?: string;
      stepDetail?: string;
      stepCitations?: Array<{ url: string; evidence?: string }>;
      assumptions?: string[];
      strict?: boolean;
    };
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    // Derive a sourceHost from citations when possible
    const citedHosts = Array.isArray(stepCitations)
      ? Array.from(new Set(stepCitations.map((c) => getHost(c?.url)).filter(Boolean)))
      : [];
    const singleHost = citedHosts.length === 1 ? citedHosts[0] : undefined;

    // Retrieval query uses only stepDetail, assumptions, and the question.
    // We ignore chat history for retrieval to avoid drifting off-step.
    const retrievalQuery = [
      assumptions && assumptions.length ? `ASSUMPTIONS:\n${assumptions.join('\n')}` : '',
      stepDetail ? `STEP_DETAIL:\n${stepDetail}` : '',
      `USER: ${message}`,
    ].filter(Boolean).join('\n');

    // Strict mode: constrain retrieval to the step's cited host (if available) and do not fallback.
    // Non-strict: try cited host if unambiguous, then fallback to global if empty.
    let results = [] as Awaited<ReturnType<typeof semanticSearch>>;
    if (strict) {
      const effFilters = singleHost ? { sourceHost: singleHost } : filters;
      results = await semanticSearch(retrievalQuery, Number(topK) || 5, effFilters);
    } else {
      if (singleHost) {
        results = await semanticSearch(retrievalQuery, Number(topK) || 5, { sourceHost: singleHost });
        if (!results || results.length === 0) {
          results = await semanticSearch(retrievalQuery, Math.max(3, (Number(topK) || 5) - 2), undefined);
        }
      } else {
        results = await semanticSearch(retrievalQuery, Number(topK) || 5, filters);
        if (!results || results.length === 0) {
          results = await semanticSearch(retrievalQuery, Math.max(3, (Number(topK) || 5) - 2), undefined);
        }
      }
    }

    const retrieved = buildContext(results);

    const model = getGeminiModel();
    const res = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: SYSTEM }] },
        ...(history ? history.map((h) => ({ role: toGeminiRole(h.role), parts: [{ text: h.content }] }) as any) : []),
        { role: 'user', parts: [{ text: `STEP_DETAIL:\n${stepDetail || '(missing)'}\n\n${assumptions && assumptions.length ? 'ASSUMPTIONS:\n' + assumptions.join('\n') : ''}` }] },
        { role: 'user', parts: [{ text: `CITATIONS:\n${Array.isArray(stepCitations) && stepCitations.length ? stepCitations.map((c, i) => `[${i + 1}] ${c.url} — ${c.evidence || ''}`).join('\n') : '(none provided)'}` }] },
        { role: 'user', parts: [{ text: `RETRIEVED_CONTEXT:\n${retrieved || '(no matching context)'}` }] },
        { role: 'user', parts: [{ text: `QUESTION:\n${message}` }] },
      ],
      generationConfig: { responseMimeType: 'application/json' } as any,
    } as any);

    const text = res.response?.text?.() || '';
    let json: any = null;
    try { json = JSON.parse(text); } catch {}

    if (!json?.answer) {
      const backupAnswer = stepDetail
        ? `Based on the selected step, here is the guidance:\n\n${stepDetail}`
        : 'Here is the best available guidance from the provided context.';
      const backupCitations = Array.isArray(stepCitations)
        ? stepCitations.slice(0, 3).map((c) => ({ url: c.url, evidence: c.evidence || '' }))
        : [];
      return NextResponse.json({ answer: backupAnswer, citations: backupCitations });
    }

    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
