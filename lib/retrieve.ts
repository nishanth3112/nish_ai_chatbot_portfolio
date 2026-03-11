import { promises as fs } from "fs";
import path from "path";

export type KnowledgeChunk = {
  id: string;
  source: string;
  section: string;
  title: string;
  content: string;
  url: string | null;
};

export type ChatSource = {
  title: string;
  url: string | null;
};

type RetrievalOptions = {
  limit?: number;
  minScore?: number;
};

type RetrievalResult = {
  chunks: KnowledgeChunk[];
  sources: ChatSource[];
};

type UnknownRecord = Record<string, unknown>;
type RankedChunk = {
  chunk: KnowledgeChunk;
  score: number;
  index: number;
};

const DATA_DIR = path.join(process.cwd(), "data");
const WORD_REGEX = /[a-z0-9]+/g;
const IMPORTANT_ENTITIES = [
  "nishanth manoharan",
  "nishai",
  "exact sciences",
  "northeastern university",
  "srm institute of science and technology",
  "swedenterprises",
  "skill vertex",
  "rag",
  "retrieval augmented generation",
  "langchain",
  "microsoft fabric",
  "aws bedrock",
  "streamlit",
  "tableau",
  "snowflake",
  "airflow",
  "dbt",
  "pyspark",
];

const INTENT_SECTION_BOOSTS: Array<{
  triggers: string[];
  sections: string[];
}> = [
  {
    triggers: ["who is", "summary", "profile", "about"],
    sections: ["summary", "profile", "about"],
  },
  {
    triggers: ["current role", "current job", "what does he do", "experience"],
    sections: ["experience", "current-role", "role"],
  },
  {
    triggers: ["education", "degree", "university", "college"],
    sections: ["education", "coursework"],
  },
  {
    triggers: ["project", "built", "repo", "github"],
    sections: ["projects", "project", "github"],
  },
  {
    triggers: ["skills", "tools", "tech stack", "stack"],
    sections: ["skills", "tooling"],
  },
];

let knowledgeBaseCache: KnowledgeChunk[] | null = null;

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value).match(WORD_REGEX) ?? [];
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function buildChunk(record: UnknownRecord, fallbackId: string, fileName: string): KnowledgeChunk | null {
  const title = toNonEmptyString(record.title) ?? "Portfolio Knowledge";
  const content =
    toNonEmptyString(record.content) ??
    toNonEmptyString(record.text) ??
    toNonEmptyString(record.body);

  if (!content) {
    return null;
  }

  const source =
    toNonEmptyString(record.source) ?? fileName.replace(/\.json$/i, "");
  const section = toNonEmptyString(record.section) ?? "general";

  return {
    id: toNonEmptyString(record.id) ?? fallbackId,
    source,
    section,
    title,
    content,
    url: toNonEmptyString(record.url),
  };
}

function extractChunks(json: unknown, fileName: string): KnowledgeChunk[] {
  const items = Array.isArray(json)
    ? json
    : json &&
        typeof json === "object" &&
        Array.isArray((json as UnknownRecord).chunks)
      ? ((json as UnknownRecord).chunks as unknown[])
      : [];

  return items
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      return buildChunk(item as UnknownRecord, `${fileName}-${index}`, fileName);
    })
    .filter((item): item is KnowledgeChunk => Boolean(item));
}

async function loadKnowledgeBase(): Promise<KnowledgeChunk[]> {
  if (knowledgeBaseCache) {
    return knowledgeBaseCache;
  }

  let files: string[];

  try {
    files = await fs.readdir(DATA_DIR);
  } catch {
    return [];
  }

  const jsonFiles = files.filter((file) => file.endsWith(".json"));

  const chunkGroups = await Promise.all(
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

  knowledgeBaseCache = chunkGroups.flat();
  return knowledgeBaseCache;
}

function countOverlap(tokens: string[], queryTerms: Set<string>): number {
  let score = 0;

  for (const token of dedupeStrings(tokens)) {
    if (queryTerms.has(token)) {
      score += 1;
    }
  }

  return score;
}

function getEntityBoost(queryNormalized: string, haystack: string): number {
  let boost = 0;

  for (const entity of IMPORTANT_ENTITIES) {
    if (queryNormalized.includes(entity) && haystack.includes(entity)) {
      boost += 4;
    }
  }

  return boost;
}

function getIntentBoost(queryNormalized: string, sectionNormalized: string): number {
  let boost = 0;

  for (const rule of INTENT_SECTION_BOOSTS) {
    const triggerMatched = rule.triggers.some((trigger) =>
      queryNormalized.includes(trigger),
    );

    if (!triggerMatched) {
      continue;
    }

    const sectionMatched = rule.sections.some((section) =>
      sectionNormalized.includes(section),
    );

    if (sectionMatched) {
      boost += 4;
    }
  }

  return boost;
}

function scoreChunk(chunk: KnowledgeChunk, query: string): number {
  const queryNormalized = normalizeText(query);
  const queryTerms = new Set(tokenize(query));

  if (queryTerms.size === 0) {
    return 0;
  }

  const titleNormalized = normalizeText(chunk.title);
  const contentNormalized = normalizeText(chunk.content);
  const sectionNormalized = normalizeText(chunk.section);
  const sourceNormalized = normalizeText(chunk.source);

  const titleScore = countOverlap(tokenize(chunk.title), queryTerms) * 3;
  const sectionScore =
    countOverlap(tokenize(chunk.section), queryTerms) * 2 +
    countOverlap(tokenize(chunk.source), queryTerms) * 2;
  const contentScore = countOverlap(tokenize(chunk.content), queryTerms);

  const fullText = [titleNormalized, sectionNormalized, sourceNormalized, contentNormalized]
    .filter(Boolean)
    .join(" ");

  let score = titleScore + sectionScore + contentScore;

  if (queryNormalized.length >= 6 && fullText.includes(queryNormalized)) {
    score += 8;
  }

  if (queryNormalized.length >= 6 && titleNormalized.includes(queryNormalized)) {
    score += 6;
  }

  score += getEntityBoost(queryNormalized, fullText);
  score += getIntentBoost(queryNormalized, sectionNormalized);

  return score;
}

function selectTopChunks(ranked: RankedChunk[], limit: number): KnowledgeChunk[] {
  const selected: KnowledgeChunk[] = [];
  const seenTitles = new Set<string>();

  for (const item of ranked) {
    const titleKey = normalizeText(item.chunk.title);

    if (seenTitles.has(titleKey)) {
      continue;
    }

    seenTitles.add(titleKey);
    selected.push(item.chunk);

    if (selected.length === limit) {
      break;
    }
  }

  return selected;
}

export async function retrieveRelevantChunks(
  query: string,
  options: RetrievalOptions = {},
): Promise<RetrievalResult> {
  const limit = options.limit ?? 5;
  const minScore = options.minScore ?? 4;
  const chunks = await loadKnowledgeBase();

  const ranked = chunks
    .map((chunk, index) => ({
      chunk,
      score: scoreChunk(chunk, query),
      index,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.index - b.index;
    });

  const topChunks = selectTopChunks(
    ranked.filter((item) => item.score >= minScore),
    limit,
  );
  const sources = dedupeStrings(
    topChunks.map((chunk) => `${chunk.title}||${chunk.url ?? ""}`),
  ).map((entry) => {
    const [title, url] = entry.split("||");
    return {
      title,
      url: url || null,
    };
  });

  return {
    chunks: topChunks,
    sources,
  };
}
