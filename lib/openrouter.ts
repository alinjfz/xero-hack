export function getOpenRouterConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-5.2";

  return {
    configured: Boolean(apiKey),
    apiKey,
    model: apiKey ? model : null,
  };
}

export async function generateOpenRouterBrief(input: {
  model: string;
  apiKey: string;
  siteUrl?: string;
  siteName?: string;
  summary: object;
}) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      ...(input.siteUrl ? { "HTTP-Referer": input.siteUrl } : {}),
      ...(input.siteName ? { "X-OpenRouter-Title": input.siteName } : {}),
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are a finance operations copilot for a small business owner. Write crisp, plain-English operating guidance. Be specific, practical, and grounded in the supplied numbers. Do not mention JSON or raw field names.",
        },
        {
          role: "user",
          content: `Write a short finance brief with these sections: Situation, Risks, Recommended actions this week. Keep it under 220 words.\n\nData:\n${JSON.stringify(
            input.summary,
          )}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || "OpenRouter request failed.");
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  return data.choices?.[0]?.message?.content?.trim() ?? "";
}
