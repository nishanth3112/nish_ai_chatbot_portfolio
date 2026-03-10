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
- Answer only the specific question asked by the user.
- If the context is insufficient or the answer is not present, respond with: "There is no information regarding that in Nishanth's portfolio."
- Do not guess, infer, assume, or fill gaps.
- Keep answers crisp, professional, factual, and recruiter-friendly.
- Do not give long explanations unless the user explicitly asks for detail.
- Do not invent or infer metrics, dates, skills, titles, employers, education details, certifications, or experiences that are not explicitly stated in the context.
- Do not claim to have browsed the web, accessed external systems, or verified anything outside the provided context.
- When relevant, summarize what the context says rather than copying large passages.
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
      const sourceLine = chunk.url ? `Source URL: ${chunk.url}` : "Source URL: none";

      return [
        `[Context ${index + 1}]`,
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
