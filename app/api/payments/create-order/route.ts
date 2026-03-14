import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

type CreateOrderBody = {
  resultId?: string;
  workspaceId?: string;
  feature?: string;
};

type RazorpayOrderResponse = {
  id?: string;
  amount?: number;
  currency?: string;
  error?: {
    description?: string;
    reason?: string;
  };
  message?: string;
};

const FEATURE_PRICING: Record<string, { amount: number; currency: string }> = {
  generate_all: {
    amount: 9900,
    currency: "INR",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRazorpayError(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;

  const directError = payload.error;
  if (typeof directError === "string" && directError.trim()) return directError;

  if (isRecord(directError)) {
    const description = directError.description;
    const reason = directError.reason;
    if (typeof description === "string" && description.trim()) return description;
    if (typeof reason === "string" && reason.trim()) return reason;
  }

  const message = payload.message;
  if (typeof message === "string" && message.trim()) return message;

  return fallback;
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = (await req.json()) as CreateOrderBody;

    const feature = (body.feature || "generate_all").trim();
    const resultId = (body.resultId || "").trim();
    const workspaceId = (body.workspaceId || "").trim();

    if (!resultId) {
      return NextResponse.json(
        { ok: false, error: "Missing resultId." },
        { status: 400 }
      );
    }

    if (!workspaceId) {
      return NextResponse.json(
        { ok: false, error: "Missing workspaceId." },
        { status: 400 }
      );
    }

    const pricing = FEATURE_PRICING[feature];
    if (!pricing) {
      return NextResponse.json(
        { ok: false, error: "Unsupported payment feature." },
        { status: 400 }
      );
    }

    const razorpayKeyId = (process.env.RAZORPAY_KEY_ID || "").trim();
    const razorpayKeySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();

    if (!razorpayKeyId || !razorpayKeySecret) {
      return NextResponse.json(
        { ok: false, error: "Missing Razorpay server keys." },
        { status: 500 }
      );
    }

    const basicAuth = Buffer.from(
      `${razorpayKeyId}:${razorpayKeySecret}`
    ).toString("base64");

    const receipt = `rcpt_${Date.now()}`;

    const payload = {
      amount: pricing.amount,
      currency: pricing.currency,
      receipt,
      notes: {
        feature,
        resultId,
        workspaceId,
        clerkUserId: userId,
      },
    };

    const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const razorpayJson = (await razorpayRes.json()) as RazorpayOrderResponse;

    if (!razorpayRes.ok || !razorpayJson.id) {
      return NextResponse.json(
        {
          ok: false,
          error: getRazorpayError(
            razorpayJson,
            `Razorpay order creation failed with status ${razorpayRes.status}.`
          ),
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      orderId: razorpayJson.id,
      amount: razorpayJson.amount ?? pricing.amount,
      currency: razorpayJson.currency ?? pricing.currency,
      keyId: razorpayKeyId,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create payment order.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}