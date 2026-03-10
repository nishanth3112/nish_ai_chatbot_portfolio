const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

function getGroqConfig() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const model = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;

  if (!apiKey) {
    throw new Error(
      "Missing GROQ_API_KEY. Set GROQ_API_KEY in the server environment.",
    );
  }

  return {
    apiKey,
    model,
    url: GROQ_API_URL,
  };
}

function extractTextContent(
  content: string | Array<{ type?: string; text?: string }> | undefined,
): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (part.type === "text" ? part.text ?? "" : ""))
      .join("")
      .trim();
  }

  return "";
}

export async function callChatModel(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const groq = getGroqConfig();

  const response = await fetch(groq.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${groq.apiKey}`,
    },
    body: JSON.stringify({
      model: groq.model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Model request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const answer = extractTextContent(data.choices?.[0]?.message?.content);

  if (!answer) {
    throw new Error("Model response was empty.");
  }

  return answer;
}
