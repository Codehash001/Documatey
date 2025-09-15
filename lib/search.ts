import { pool, TABLE_NAME } from '@/lib/tidb';
import { embedTexts } from '@/lib/embed';

export interface SearchFilters {
  sourceHost?: string; // filter by host portion of source_url
  sourcePrefix?: string; // filter by source_url LIKE prefix
}

export interface SearchResultRow {
  source_url: string | null;
  content: string;
  distance: number;
}

export async function semanticSearch(query: string, topK = 8, filters?: SearchFilters): Promise<SearchResultRow[]> {
  const [qvec] = await embedTexts([query]);
  const embeddingJson = JSON.stringify(qvec);

  let where = '';
  const params: any[] = [];
  if (filters?.sourceHost) {
    where += (where ? ' AND ' : 'WHERE ') + `source_url LIKE ?`;
    params.push(`%://${filters.sourceHost}%`);
  }
  if (filters?.sourcePrefix) {
    where += (where ? ' AND ' : 'WHERE ') + `source_url LIKE ?`;
    params.push(`${filters.sourcePrefix}%`);
  }

  const sql = `
    SELECT source_url, content,
      VEC_COSINE_DISTANCE(embedding, ?) AS distance
    FROM ${TABLE_NAME}
    ${where}
    ORDER BY distance ASC
    LIMIT ?
  `;
  params.unshift(embeddingJson);
  params.push(topK);

  const [rows] = await pool.query(sql, params);
  // mysql2 returns RowDataPacket; coerce plain
  return (rows as any[]).map((r) => ({
    source_url: r.source_url ?? null,
    content: r.content,
    distance: Number(r.distance),
  }));
}
