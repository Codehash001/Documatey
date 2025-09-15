import { GoogleGenerativeAI } from '@google/generative-ai';

const { GOOGLE_API_KEY, LLM_MODEL = 'gemini-2.5-pro' } = process.env as Record<string, string>;

let client: GoogleGenerativeAI | null = null;

export function getGeminiClient() {
  if (!client) {
    if (!GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY is not set');
    client = new GoogleGenerativeAI(GOOGLE_API_KEY);
  }
  return client;
}

export function getGeminiModel(modelName?: string) {
  const genai = getGeminiClient();
  return genai.getGenerativeModel({ model: modelName || LLM_MODEL });
}

export async function generateText(prompt: string, system?: string) {
  const model = getGeminiModel();
  const res = await model.generateContent({
    contents: [
      ...(system ? [{ role: 'user', parts: [{ text: `System:
${system}` }] }] : []),
      { role: 'user', parts: [{ text: prompt }] },
    ],
  } as any);
  const out = res.response?.text?.() ?? '';
  return out;
}
