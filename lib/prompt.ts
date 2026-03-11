import type { KnowledgeChunk } from "./retrieve";

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type BuildPromptsParams = {
  message: string;
  history: ChatHistoryItem[];
  chunks: KnowledgeChunk[];
};

const SYSTEM_PROMPT = `
You are NishAI, Nishanth's AI Portfolio Assistant.

Your job is to answer recruiter-facing questions using only the provided portfolio context.

Rules:
- Answer only from the supplied context.
- If the answer is directly or reasonably supported by the context, answer confidently.
- If the answer is unsupported or unclear from the context, respond exactly: "There is no information regarding that in Nishanth's portfolio."
- Be concise, factual, recruiter-friendly, and professional.
- Answer only the user's question. Do not add extra explanation unless the user asks for more detail.
- Do not hallucinate, speculate, infer unstated facts, or invent metrics, dates, skills, titles, employers, education details, certifications, links, or experiences.
- Prefer short direct answers over long summaries.
- If multiple context items are relevant, synthesize them briefly.
`.trim();

function formatHistory(history: ChatHistoryItem[]): string {
  if (history.length === 0) {
    return "No prior conversation history.";
  }

  return history
    .map((item, index) => {
      const speaker = item.role === "user" ? "User" : "Assistant";
      return `[History ${index + 1}] ${speaker}: ${item.content}`;
    })
    .join("\n");
}

function formatContext(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) {
    return "No relevant portfolio context was retrieved for this question.";
  }

  return chunks
    .map((chunk, index) => {
      const sourceLine = chunk.url ? `URL: ${chunk.url}` : "URL: none";

      return [
        `[Context ${index + 1}]`,
        `Source: ${chunk.source}`,
        `Section: ${chunk.section}`,
        `Title: ${chunk.title}`,
        sourceLine,
        `Content: ${chunk.content}`,
      ].join("\n");
    })
    .join("\n\n");
}

export function buildPrompts({
  message,
  history,
  chunks,
}: BuildPromptsParams): { systemPrompt: string; userPrompt: string } {
  const historyBlock = formatHistory(history);
  const contextBlock = formatContext(chunks);

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: [
      `Portfolio context:\n${contextBlock}`,
      `Conversation history:\n${historyBlock}`,
      `Current user question:\n${message}`,
    ].join("\n\n"),
  };
}
