import { promises as fs } from "fs";
import path from "path";

export type KnowledgeChunk = {
  id: string;
  title: string;
  content: string;
  url: string | null;
  keywords?: string[];
};

export type ChatSource = {
  title: string;
  url: string | null;
};

type RetrievalOptions = {
  limit?: number;
};

type RetrievalResult = {
  chunks: KnowledgeChunk[];
  sources: ChatSource[];
};

type UnknownRecord = Record<string, unknown>;

const DATA_DIR = path.join(process.cwd(), "data");
const WORD_REGEX = /[a-z0-9]+/g;

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function tokenize(value: string): string[] {
  return normalizeText(value).match(WORD_REGEX) ?? [];
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toNonEmptyString(item))
    .filter((item): item is string => Boolean(item));
}

function buildChunk(record: UnknownRecord, fallbackId: string): KnowledgeChunk | null {
  const title =
    toNonEmptyString(record.title) ??
    toNonEmptyString(record.heading) ??
    "Portfolio Knowledge";
  const content =
    toNonEmptyString(record.content) ??
    toNonEmptyString(record.text) ??
    toNonEmptyString(record.body);

  if (!content) {
    return null;
  }

  return {
    id: toNonEmptyString(record.id) ?? fallbackId,
    title,
    content,
    url: toNonEmptyString(record.url),
    keywords: toStringArray(record.keywords),
  };
}

function extractChunks(json: unknown, fileName: string): KnowledgeChunk[] {
  const items = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as UnknownRecord).chunks)
      ? ((json as UnknownRecord).chunks as unknown[])
      : [];

  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      return buildChunk(item as UnknownRecord, `${fileName}-${index}`);
    })
    .filter((item): item is KnowledgeChunk => Boolean(item));
}

async function loadKnowledgeBase(): Promise<KnowledgeChunk[]> {
  let files: string[];

  try {
    files = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }

  const jsonFiles = files.filter((file) => file.endsWith(".json"));

  const chunks = await Promise.all(
    jsonFiles.map(async (file) => {
      try {
        const filePath = path.join(DATA_DIR, file);
        const raw = await fs.readFile(filePath, "utf8");
        const json = JSON.parse(raw) as unknown;

        return extractChunks(json, file);
      } catch (error) {
        console.error(`Failed to load knowledge file: ${file}`, error);
        return [];
      }
    }),
  );

  return chunks.flat();
}

function scoreChunk(chunk: KnowledgeChunk, queryTerms: Set<string>): number {
  if (queryTerms.size === 0) {
    return 0;
  }

  const chunkTerms = new Set([
    ...tokenize(chunk.title),
    ...tokenize(chunk.content),
    ...(chunk.keywords?.flatMap((keyword) => tokenize(keyword)) ?? []),
  ]);

  let overlap = 0;
  for (const term of queryTerms) {
    if (chunkTerms.has(term)) {
      overlap += 1;
    }
  }

  return overlap;
}

export async function retrieveRelevantChunks(
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievalResult> {
  const limit = options.limit ?? 5;
  const chunks = await loadKnowledgeBase();
  const queryTerms = new Set(tokenize(query));

  const ranked = chunks
    .map((chunk, index) => ({
      chunk,
      score: scoreChunk(chunk, queryTerms),
      index,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.index - b.index;
    })
    .slice(0, limit)
    .map((item) => item.chunk);

  return {
    chunks: ranked,
    sources: ranked.map((chunk) => ({
      title: chunk.title,
      url: chunk.url,
    })),
  };
}
