import { NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/lib/openrouter";

export async function POST(request: Request) {
  const config = getOpenRouterConfig();

  if (!config.configured || !config.apiKey || !config.model) {
    return NextResponse.json({ error: "OpenRouter is not configured." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      customerName: string;
      intent: "overdue_followup" | "retainer_pitch" | "check_in" | "invoice_send" | "rent_followup";
      context: string[];
      subjectHint?: string;
      recipientEmail?: string;
    };

    const promptIntent =
      body.intent === "overdue_followup"
        ? "a polite but firm overdue follow-up"
        : body.intent === "invoice_send"
          ? "a short invoice-ready email that says the invoice is being sent now"
          : body.intent === "rent_followup"
            ? "a polite but clear rent collection follow-up"
        : body.intent === "retainer_pitch"
          ? "a short retainer/subscription suggestion for repeat work"
          : "a short relationship-building check-in";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "KISH",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.35,
        messages: [
          {
            role: "system",
            content:
              "You write short customer outreach drafts for a small business. Do not mention or invent any numbers, currencies, dates, balances, invoice totals, or counts unless they are explicitly provided in the prompt context. Keep the draft practical and under 140 words. Return plain email body text only.",
          },
          {
            role: "user",
            content: `Write ${promptIntent} for ${body.customerName}. Use this context:\n- ${body.context.join("\n- ")}\n\nIf useful, be specific to this person and scenario rather than generic.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Unable to generate outreach draft.");
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const draft = data.choices?.[0]?.message?.content?.trim() ?? "";
    const subject =
      body.subjectHint ??
      (body.intent === "invoice_send"
        ? `Invoice update for ${body.customerName}`
        : body.intent === "rent_followup"
          ? `Follow-up on your rent`
          : body.intent === "retainer_pitch"
            ? `A simpler way to handle ongoing work`
            : `Quick follow-up from KISH`);
    const gmailHref = new URL("https://mail.google.com/mail/");
    gmailHref.searchParams.set("view", "cm");
    gmailHref.searchParams.set("fs", "1");
    if (body.recipientEmail) {
      gmailHref.searchParams.set("to", body.recipientEmail);
    }
    gmailHref.searchParams.set("su", subject);
    gmailHref.searchParams.set("body", draft);

    return NextResponse.json({
      draft,
      subject,
      body: draft,
      gmailHref: gmailHref.toString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate outreach draft.",
      },
      { status: 500 },
    );
  }
}
