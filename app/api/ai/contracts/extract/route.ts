import { NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/lib/openrouter";
import { type ExtractedContractTerms } from "@/lib/contract-intelligence";

function extractJsonBlock(input: string) {
  const match = input.match(/\{[\s\S]*\}/);
  return match?.[0] ?? input;
}

export async function POST(request: Request) {
  const config = getOpenRouterConfig();

  if (!config.configured || !config.apiKey || !config.model) {
    return NextResponse.json({ error: "OpenRouter is not configured." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      contractType?: string;
      kind?: string;
      counterpartyName?: string;
      text?: string;
      sourceText?: string;
    };

    const text = (body.text ?? body.sourceText)?.trim();
    const contractType = body.contractType ?? body.kind;
    if (!text) {
      return NextResponse.json({ error: "Contract text is required." }, { status: 400 });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "KISH Contract Intelligence",
        ...(process.env.OPENROUTER_SITE_URL ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You extract structured commercial terms from contracts for an SME finance copilot. Return JSON only. Use null when a value is not stated. Keep the summary under 35 words.",
          },
          {
            role: "user",
            content: `Extract contract terms from this ${contractType ?? "contract"} for ${
              body.counterpartyName ?? "the stated counterparty"
            }.\n\nReturn exactly this JSON shape:\n{\n  "paymentTermDays": number | null,\n  "autoRenewal": boolean | null,\n  "renewalDate": string | null,\n  "noticePeriodDays": number | null,\n  "penaltyPercent": number | null,\n  "priceIncreasePercent": number | null,\n  "priceIncreaseDate": string | null,\n  "recurringAmount": number | null,\n  "currency": string | null,\n  "billingFrequency": "monthly" | "quarterly" | "annual" | "one_off" | "unknown",\n  "summary": string,\n  "confidence": number\n}\n\nContract text:\n${text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || "Failed to extract contract terms.");
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(extractJsonBlock(content)) as ExtractedContractTerms;

    return NextResponse.json({
      terms: parsed,
      model: config.model,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to extract contract terms." },
      { status: 500 },
    );
  }
}
