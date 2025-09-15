import mysql from 'mysql2/promise';

const {
  TIDB_HOST,
  TIDB_PORT = '4000',
  TIDB_USER,
  TIDB_PASSWORD,
  TIDB_DATABASE = 'test',
  EMBEDDING_DIM = '768',
} = process.env as Record<string, string>;

if (!TIDB_HOST || !TIDB_USER || !TIDB_PASSWORD) {
  // Do not throw at import time to keep Next.js build working; runtime will throw if used without config
  console.warn('TiDB env vars missing. Set TIDB_HOST, TIDB_USER, TIDB_PASSWORD.');
}

export const pool = mysql.createPool({
  host: TIDB_HOST,
  port: Number(TIDB_PORT),
  user: TIDB_USER,
  password: TIDB_PASSWORD,
  database: TIDB_DATABASE,
  ssl: { minVersion: 'TLSv1.2' },
  waitForConnections: true,
  connectionLimit: 5,
});

export const TABLE_NAME = 'embedded_documents';
export const VECTOR_DIM = Number(EMBEDDING_DIM || 768);

export async function ensureSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${TIDB_DATABASE}\``);
    await conn.query(`USE \`${TIDB_DATABASE}\``);

    // Try to create table with vector index declared up-front (auto columnar replica)
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
          id BIGINT PRIMARY KEY AUTO_INCREMENT,
          source_url TEXT,
          chunk_id VARCHAR(64) UNIQUE,
          content TEXT,
          embedding VECTOR(${VECTOR_DIM}),
          VECTOR INDEX idx_embedding ((VEC_COSINE_DISTANCE(embedding))) USING HNSW
        )
      `);
      return; // table created (or existed with index defined); we can exit
    } catch (e: any) {
      // If the table already exists without index, we'll handle below
      const msg = String(e?.message || e);
      if (!/already exists|exists/i.test(msg)) {
        // Ignore IF NOT EXISTS weirdness; continue to ensure index exists
      }
    }

    // Ensure vector index exists for existing table: add columnar replica on demand
    try {
      await conn.query(
        `ALTER TABLE ${TABLE_NAME} ADD VECTOR INDEX idx_embedding ((VEC_COSINE_DISTANCE(embedding))) USING HNSW ADD_COLUMNAR_REPLICA_ON_DEMAND`
      );
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (!/exists|Duplicate/i.test(msg)) throw e;
    }
  } finally {
    conn.release();
  }
}

export interface DocChunk {
  source_url?: string;
  chunk_id: string;
  content: string;
  embedding: number[];
}

export async function upsertChunks(chunks: DocChunk[]) {
  if (!chunks.length) return;
  const conn = await pool.getConnection();
  try {
    const values = chunks.map(() => '(?,?,?,?)').join(',');
    const params: any[] = [];
    for (const c of chunks) {
      params.push(c.source_url ?? null, c.chunk_id, c.content, JSON.stringify(c.embedding));
    }
    await conn.query(
      `INSERT INTO ${TABLE_NAME} (source_url, chunk_id, content, embedding) VALUES ${values} ON DUPLICATE KEY UPDATE content=VALUES(content), embedding=VALUES(embedding), source_url=VALUES(source_url)`,
      params
    );
  } finally {
    conn.release();
  }
}
