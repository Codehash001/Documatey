This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, install dependencies:

```bash
npm install
```

### Configure environment
Create a `.env.local` file in the project root with your credentials:

```bash
# TiDB Cloud / TiDB Serverless (MySQL-compatible)
TIDB_HOST=your-tidb-hostname
TIDB_PORT=4000
TIDB_USER=xxxx.root    # or your user
TIDB_PASSWORD=your_password
TIDB_DATABASE=test     # or your preferred database

# Embeddings (Google Generative AI)
GOOGLE_API_KEY=your_google_api_key
# Default model is text-embedding-004 (vector size 768)
# EMBEDDING_MODEL=text-embedding-004
# If you override the model, ensure EMBEDDING_DIM matches the model's output dimension.
EMBEDDING_DIM=768
```

Notes:
- Ensure your TiDB cluster allows public connections (or run from a private network allowed by TiDB). SSL/TLS is enabled by default in the app.
- The vector column dimension must match the embedding model dimension (text-embedding-004 = 768).
- The app creates a table `embedded_documents` and an HNSW vector index using cosine distance per TiDB docs.

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Index documentation
Use the form on the homepage to:
- Paste a documentation URL (the app will fetch, clean, and chunk it), or
- Paste unstructured text

On submit, the app will:
1. Fetch the URL (if provided) and extract main text content.
2. Chunk the text into overlapping segments.
3. Generate embeddings with Google Generative AI (text-embedding-004).
4. Ensure the TiDB schema exists and add an HNSW vector index.
5. Upsert chunks into TiDB.

You can also call the API directly:

```bash
curl -X POST http://localhost:3000/api/index \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://docs.pingcap.com/tidbcloud/vector-search-overview/"}'
```

or

```bash
curl -X POST http://localhost:3000/api/index \
  -H 'Content-Type: application/json' \
  -d '{"text": "Your unstructured document text..."}'
```

## Run Instructions

### Prerequisites
- Node.js 20.x (LTS)
- npm 10.x
- A Google Generative AI key

### Environment
Create a `.env.local` at the project root:

```bash
# Required for Google Gemini (used in lib/llm.ts)
GOOGLE_API_KEY=your_google_generative_ai_key

# Optional: override the default model
LLM_MODEL=gemini-2.5-pro
```

### Install
```bash
npm install
```
If you see EBADENGINE warnings for `undici`, update Node to 20.x.

### Development
```bash
npm run dev
# open http://localhost:3000
```
- Click “Get started” to open the Wizard.
- Step 1: Index docs by URL (same host) or paste text.
- Step 2: Clarify your goal (answer follow‑ups).
- Step 3: Generate the plan.
- Outcome: Work through the plan; the right chat is sticky and context‑aware.

### Production
```bash
npm run build
npm run start
# or: next start
```
Ensure `.env.local` (or platform env vars) exists in production.

### Scripts
```bash
npm run lint
```

### API Examples
- Index by URL
```bash
curl -X POST http://localhost:3000/api/index \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com/docs/guide"}'
```
- Index by raw text
```bash
curl -X POST http://localhost:3000/api/index \
  -H 'Content-Type: application/json' \
  -d '{"text": "Paste your documentation here..."}'
```
- Generate plan
```bash
curl -X POST http://localhost:3000/api/plan \
  -H 'Content-Type: application/json' \
  -d '{
        "goal": "Build a RAG endpoint in Next.js using TiDB",
        "answers": {
          "framework": "Next.js",
          "vector_store": "TiDB Vector"
        }
      }'
```
- Chat (context-aware via stepId)
```bash
curl -X POST http://localhost:3000/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"How do I set up env vars?","stepId":"step-1"}'
```
- Check index status
```bash
curl http://localhost:3000/api/status
```

### Troubleshooting
- "GOOGLE_API_KEY is not set"
  - Create `.env.local` with `GOOGLE_API_KEY` and restart dev server.
- EBADENGINE warnings
  - Update Node to 20.x (`node -v`) and restart the terminal.
- Hydration warnings with code blocks
  - The app uses a custom Markdown `pre` renderer in `components/wizard.tsx` to avoid `<pre>` inside `<p>`. Keep this pattern if you modify Markdown handling.
- Chat not sticky or misaligned
  - Stickiness is computed from the actual header height; it adapts on resize.

### Customize
- Plan prompt & shape: `app/api/plan/route.ts` (returns Markdown `detail` and per‑step `{url,evidence}` citations).
- Chat behavior: `/api/chat` and `components/wizard.tsx` (sends `{ message, stepId }`, shows user bubble, then final Markdown answer).
- Indexing & search: `lib/chunk.ts`, `lib/embed.ts`, `lib/search.ts` (adjust chunking, embedding model, or retrieval).
- Styling & logo: `app/globals.css`, `components/ui/*`, and the `LogoDM` SVG in `wizard.tsx`/`app/page.tsx`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

TiDB Vector Search resources:
- [Vector Search Overview](https://docs.pingcap.com/tidbcloud/vector-search-overview/)
- [Get Started via SQL](https://docs.pingcap.com/tidbcloud/vector-search-get-started-using-sql/)
- [Vector Search Index (HNSW)](https://docs.pingcap.com/tidbcloud/vector-search-index/)

Google AI resources:
- [text-embedding-004 model](https://ai.google.dev/gemini-api/docs/embeddings)
- [Gemini models overview](https://ai.google.dev/gemini-api/docs/models)

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
