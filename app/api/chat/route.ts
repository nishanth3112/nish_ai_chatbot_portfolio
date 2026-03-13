import { NextRequest, NextResponse } from "next/server";

import { callChatModel } from "../../../lib/model";
import { buildPrompts } from "../../../lib/prompt";
import { retrieveRelevantChunks } from "../../../lib/retrieve";

export const runtime = "nodejs";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://nishai.site",
  "https://nish-ai-base.base44.app",
];
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_ITEMS = 12;
const FALLBACK_ANSWER =
  "There is no information regarding that in Nishanth's portfolio.";

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequestBody = {
  message?: unknown;
  history?: unknown;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

function getAllowedOrigins(): string[] {
  const configured = process.env.ALLOWED_ORIGIN
    ?.split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  return configured && configured.length > 0
    ? configured
    : DEFAULT_ALLOWED_ORIGINS;
}

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) {
    return false;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  return getAllowedOrigins().includes(normalizedOrigin);
}

function buildCorsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };

  if (isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = normalizeOrigin(origin);
  }

  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders?: HeadersInit,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...buildCorsHeaders(origin),
      ...extraHeaders,
    },
  });
}

function parseHistory(input: unknown): ChatHistoryItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((item): item is ChatHistoryItem => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;

      return (
        (role === "user" || role === "assistant") &&
        typeof content === "string" &&
        content.trim().length > 0
      );
    })
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, MAX_MESSAGE_LENGTH),
    }));
}

function getClientIdentifier(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "anonymous";
  }

  return "anonymous";
}

async function checkRateLimit(_identifier: string): Promise<RateLimitResult> {
  // Stub for a real shared store-backed limiter (e.g. Upstash Redis, Vercel KV).
  // Keep this isolated so the route contract does not need to change later.
  return { allowed: true };
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!isAllowedOrigin(origin)) {
    return new NextResponse(null, {
      status: 403,
      headers: buildCorsHeaders(origin),
    });
  }

  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(origin),
  });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!isAllowedOrigin(origin)) {
    return jsonResponse({ error: "Origin not allowed." }, 403, origin);
  }

  const rateLimit = await checkRateLimit(getClientIdentifier(request));
  if (!rateLimit.allowed) {
    return jsonResponse(
      { error: "Rate limit exceeded." },
      429,
      origin,
      rateLimit.retryAfterSeconds
        ? { "Retry-After": String(rateLimit.retryAfterSeconds) }
        : undefined,
    );
  }

  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, origin);
  }

  const message =
    typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return jsonResponse({ error: "Message is required." }, 400, origin);
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      { error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.` },
      400,
      origin,
    );
  }

  const history = parseHistory(body.history);
  const retrieval = await retrieveRelevantChunks(message, { limit: 5 });
  const { systemPrompt, userPrompt } = buildPrompts({
    message,
    history,
    chunks: retrieval.chunks,
  });

  try {
    const answer = await callChatModel(systemPrompt, userPrompt);
    const sources =
      answer === FALLBACK_ANSWER ? [] : retrieval.sources;

    return jsonResponse(
      {
        answer,
        sources,
      },
      200,
      origin,
    );
  } catch (error) {
    console.error("Chat route error:", error);

    return jsonResponse(
      {
        error: "Unable to generate a response at this time.",
      },
      500,
      origin,
    );
  }
}
