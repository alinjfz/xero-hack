import { NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/lib/openrouter";

export async function POST(request: Request) {
  const config = getOpenRouterConfig();

  if (!config.configured || !config.apiKey || !config.model) {
    return NextResponse.json({ error: "OpenRouter is not configured." }, { status: 400 });
  }

  try {
    const body = await request.json();
    const {
      customerName,
      revenue,
      supportCost,
      revisionCost,
      subcontractorCost,
      paymentLatePenalty,
    } = body;

    const trueProfit = revenue - (supportCost + revisionCost + subcontractorCost + paymentLatePenalty);
    const margin = revenue > 0 ? (trueProfit / revenue) * 100 : 0;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "KISH",
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are a strategic cash-flow optimization expert. Analyze the customer's profit leakage breakdown and provide extremely brief, high-impact tactical advice. Be direct, professional, and practical.",
          },
          {
            role: "user",
            content: `Analyze this customer's profitability breakdown:
Customer: ${customerName}
Revenue: £${revenue.toLocaleString()}
True Profit: £${trueProfit.toLocaleString()} (Margin: ${margin.toFixed(1)}%)

Leakage Drivers:
- Support Overhead: £${supportCost.toLocaleString()}
- Scope/Revision Creep: £${revisionCost.toLocaleString()}
- Subcontractor Cost: £${subcontractorCost.toLocaleString()}
- Payment Delay Cost: £${paymentLatePenalty.toLocaleString()}

Please provide:
1. A 1-sentence diagnostic explaining WHY they are losing money or have low margin.
2. A single high-impact recommendation (e.g., Increase prices by 15%, Charge a 20% revision fee, Fire this customer, renegotiate terms, or standardize onboarding). Keep the whole response under 70 words total.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(errText || "Failed to fetch response from OpenRouter");
    }

    const resData = await response.json();
    const recommendation = resData.choices?.[0]?.message?.content?.trim() ?? "Unable to analyze customer.";

    return NextResponse.json({
      recommendation,
      trueProfit,
      margin,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error analyzing profitability" },
      { status: 500 }
    );
  }
}
