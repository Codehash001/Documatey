import * as cheerio from 'cheerio';

export async function fetchAndExtractText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'DocHelperBot/1.0' } });
  if (!res.ok) throw new Error(`Failed to fetch URL: ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  // Remove scripts, styles, navs, footers
  ['script', 'style', 'noscript', 'nav', 'footer', 'header'].forEach((sel) => $(sel).remove());
  const text = $('body').text();
  return normalizeWhitespace(text);
}

export function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim();
}

export function chunkText(text: string, opts?: { chunkSize?: number; overlap?: number }) {
  const chunkSize = opts?.chunkSize ?? 1200; // characters
  const overlap = opts?.overlap ?? 200; // characters
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    let chunk = text.slice(i, end);
    // try to cut at sentence boundary
    const lastPeriod = chunk.lastIndexOf('. ');
    if (lastPeriod > chunkSize * 0.6 && end < text.length) {
      chunk = chunk.slice(0, lastPeriod + 1);
    }
    chunks.push(chunk.trim());
    if (end >= text.length) break;
    i += Math.max(1, chunk.length - overlap);
  }
  return chunks.filter(Boolean);
}

function isLikelyHtmlPath(path: string) {
  // Skip binary and asset files
  return !/(\.(png|jpe?g|gif|svg|webp|ico|pdf|zip|tar|gz|tgz|mp4|mp3|wav|ogg|webm|css|js|json|xml))$/i.test(path);
}

function absolutizeLink(base: URL, href: string): URL | null {
  try {
    const u = new URL(href, base);
    if (u.hash) u.hash = '';
    return u;
  } catch {
    return null;
  }
}

export interface CrawlResult {
  url: string;
  text: string;
}

export async function crawlSite(startUrl: string, opts?: { maxPages?: number; maxDepth?: number; delayMs?: number }) {
  const maxPages = opts?.maxPages ?? Number(process.env.CRAWL_MAX_PAGES ?? 30);
  const maxDepth = opts?.maxDepth ?? Number(process.env.CRAWL_MAX_DEPTH ?? 2);
  const delayMs = opts?.delayMs ?? Number(process.env.CRAWL_DELAY_MS ?? 150);

  const start = new URL(startUrl);
  const queue: { url: URL; depth: number }[] = [{ url: start, depth: 0 }];
  const seen = new Set<string>();
  const results: CrawlResult[] = [];

  while (queue.length && results.length < maxPages) {
    const { url, depth } = queue.shift()!;
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);

    if (url.host !== start.host || !isLikelyHtmlPath(url.pathname)) continue;

    try {
      const res = await fetch(url.toString(), { headers: { 'User-Agent': 'DocHelperBot/1.0' } });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      ['script', 'style', 'noscript', 'nav', 'footer', 'header'].forEach((sel) => $(sel).remove());
      const text = normalizeWhitespace($('body').text());
      if (text) {
        results.push({ url: url.toString(), text });
      }
      if (depth < maxDepth) {
        const links = new Set<string>();
        $('a[href]').each((_, el) => {
          const href = ($(el).attr('href') || '').trim();
          if (!href) return;
          links.add(href);
        });
        for (const href of links) {
          const next = absolutizeLink(url, href);
          if (!next) continue;
          if (next.host !== start.host) continue;
          if (!isLikelyHtmlPath(next.pathname)) continue;
          const norm = next.toString();
          if (!seen.has(norm)) queue.push({ url: next, depth: depth + 1 });
        }
      }
    } catch {
      // ignore fetch/parse errors for robustness
    }

    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
  }

  return results;
}
