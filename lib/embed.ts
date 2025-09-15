import { GoogleGenerativeAI } from '@google/generative-ai';

const {
  GOOGLE_API_KEY,
  EMBEDDING_MODEL = 'text-embedding-004',
} = process.env as Record<string, string>;

let client: GoogleGenerativeAI | null = null;

export function getGoogleClient() {
  if (!client) {
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is not set');
    }
    client = new GoogleGenerativeAI(GOOGLE_API_KEY);
  }
  return client;
}

export async function embedTexts(texts: string[]) {
  if (!texts.length) return [] as number[][];
  const genai = getGoogleClient();
  const model = genai.getGenerativeModel({ model: EMBEDDING_MODEL });

  if (texts.length === 1) {
    const res = await model.embedContent({
      content: { parts: [{ text: texts[0] }] },
    } as any);
    const v = (res?.embedding?.values ?? []) as number[];
    return [v];
  }

  // Try batch first
  const batchMethod = (model as any).batchEmbedContents?.bind(model);
  if (batchMethod) {
    const batchRes = await batchMethod({
      requests: texts.map((t) => ({
        content: { parts: [{ text: t }] },
      })),
    });
    const vectors = (batchRes?.embeddings ?? []).map((e: any) => e.values as number[]);
    if (vectors.length === texts.length) return vectors;
  }

  // Fallback: sequential
  const vectors: number[][] = [];
  for (const t of texts) {
    const r = await model.embedContent({
      content: { parts: [{ text: t }] },
    } as any);
    const v = (r?.embedding?.values ?? []) as number[];
    vectors.push(v);
  }
  return vectors;
}
