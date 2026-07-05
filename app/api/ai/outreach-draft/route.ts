import { NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/lib/openrouter";

type OutreachDraftBody = {
  customerName: string;
  intent: "overdue_followup" | "retainer_pitch" | "check_in" | "invoice_send" | "rent_followup";
  context: string[];
  subjectHint?: string;
  recipientEmail?: string;
  senderName?: string;
  senderCompany?: string;
};

function buildFallbackDraft(body: OutreachDraftBody) {
  const senderLine = [body.senderName, body.senderCompany].filter(Boolean).join(" · ");

  const intro =
    body.intent === "overdue_followup"
      ? `Hi ${body.customerName},\n\nFollowing up on the outstanding invoice on your side.`
      : body.intent === "invoice_send"
        ? `Hi ${body.customerName},\n\nYour invoice is ready and is being sent through now.`
        : body.intent === "rent_followup"
          ? `Hi ${body.customerName},\n\nFollowing up on the rent payment and checking whether anything is holding it up.`
          : body.intent === "retainer_pitch"
            ? `Hi ${body.customerName},\n\nI wanted to suggest a simpler recurring setup for the ongoing work between us.`
            : `Hi ${body.customerName},\n\nJust checking in on the current work and anything you need from our side.`;

  const close =
    body.intent === "retainer_pitch"
      ? "If helpful, I can outline a simple recurring arrangement that keeps things easier month to month."
      : "If helpful, I can resend anything or clarify any details.";

  const signoff = senderLine ? `\n\nBest,\n${senderLine}` : "\n\nBest,";

  return `${intro}\n\n${close}${signoff}`;
}

function buildSubject(body: OutreachDraftBody) {
  return (
    body.subjectHint ??
    (body.intent === "invoice_send"
      ? `Invoice update for ${body.customerName}`
      : body.intent === "rent_followup"
        ? "Follow-up on your rent"
        : body.intent === "retainer_pitch"
          ? "A simpler way to handle ongoing work"
          : "Quick follow-up from KISH")
  );
}

function buildGmailHref(params: { recipientEmail?: string; subject: string; body: string }) {
  const gmailHref = new URL("https://mail.google.com/mail/");
  gmailHref.searchParams.set("view", "cm");
  gmailHref.searchParams.set("fs", "1");
  if (params.recipientEmail) {
    gmailHref.searchParams.set("to", params.recipientEmail);
  }
  gmailHref.searchParams.set("su", params.subject);
  gmailHref.searchParams.set("body", params.body);
  return gmailHref.toString();
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as OutreachDraftBody | null;

  if (!body?.customerName || !body.intent || !Array.isArray(body.context)) {
    return NextResponse.json({ error: "Invalid outreach draft request." }, { status: 400 });
  }

  const config = getOpenRouterConfig();
  const fallbackDraft = buildFallbackDraft(body);
  const subject = buildSubject(body);
  const fallbackPayload = {
    draft: fallbackDraft,
    subject,
    body: fallbackDraft,
    gmailHref: buildGmailHref({
      recipientEmail: body.recipientEmail,
      subject,
      body: fallbackDraft,
    }),
    fallback: true,
  };

  if (!config.configured || !config.apiKey || !config.model) {
    return NextResponse.json(fallbackPayload, { headers: { "Cache-Control": "no-store" } });
  }

  try {
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
              "You write short customer outreach drafts for a small business. Do not mention or invent any numbers, currencies, dates, balances, invoice totals, or counts unless they are explicitly provided in the prompt context. Keep the draft practical and under 140 words. Return plain email body text only, fully signed off with the sender name and company if provided.",
          },
          {
            role: "user",
            content: `Write ${promptIntent} for ${body.customerName}. Use this context:\n- ${body.context.join("\n- ")}\n- Sender name: ${body.senderName ?? "Finance team"}\n- Sender company: ${body.senderCompany ?? "the company"}\n\nIf useful, be specific to this person and scenario rather than generic.`,
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
    const finalDraft = draft || fallbackDraft;

    return NextResponse.json({
      draft: finalDraft,
      subject,
      body: finalDraft,
      gmailHref: buildGmailHref({
        recipientEmail: body.recipientEmail,
        subject,
        body: finalDraft,
      }),
      fallback: !draft,
    });
  } catch {
    return NextResponse.json(fallbackPayload, { headers: { "Cache-Control": "no-store" } });
  }
}
