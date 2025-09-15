import { NextRequest, NextResponse } from 'next/server';
import { getGeminiModel } from '@/lib/llm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM = `You are a senior developer-assistant that crafts concise, targeted clarifying questions before helping implement a user's goal based on technical documentation.
- Ask only questions whose answers materially change the implementation steps.
- Prefer multiple-choice or enumerated options when possible.
- Keep it between 3 and 7 questions.
- Consider language, framework, runtime, versions, environment, constraints, and required outputs.
Return JSON only: { "questions": [ { "id": string, "text": string, "options"?: string[] } ] }`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { goal, context } = body as { goal?: string; context?: Record<string, string> };
    if (!goal) return NextResponse.json({ error: 'goal is required' }, { status: 400 });

    const model = getGeminiModel();
    const res = await model.generateContent({
      contents: [
        { role: 'user', parts: [{ text: SYSTEM }] },
        { role: 'user', parts: [{ text: `Goal:\n${goal}\n\nContext:\n${JSON.stringify(context || {}, null, 2)}` }] },
      ],
      generationConfig: { responseMimeType: 'application/json' } as any,
    } as any);

    const text = res.response?.text?.() || '';
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* try to salvage */ }
    if (!json?.questions) {
      return NextResponse.json({ questions: [] });
    }
    return NextResponse.json(json);
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
