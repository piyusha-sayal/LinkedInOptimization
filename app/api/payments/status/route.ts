import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { savePaymentUnlock } from "@/lib/paymentUnlockStore";

export const runtime = "nodejs";

type VerifyPaymentBody = {
  resultId?: string;
  feature?: string;
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
};

type RazorpayPaymentResponse = {
  id?: string;
  status?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  error?: {
    description?: string;
    reason?: string;
  };
  message?: string;
};

const SUPPORTED_FEATURES = new Set(["generate_all"]);
const ACCEPTED_PAYMENT_STATUSES = new Set(["authorized", "captured"]);

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

function safeEqualHex(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "hex");
  const bBuf = Buffer.from(b, "hex");

  if (aBuf.length !== bBuf.length) return false;

  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function fetchRazorpayPayment(
  paymentId: string,
  keyId: string,
  keySecret: string
): Promise<RazorpayPaymentResponse> {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const json = (await res.json()) as RazorpayPaymentResponse;

  if (!res.ok) {
    throw new Error(
      getRazorpayError(
        json,
        `Failed to fetch payment status from Razorpay (${res.status}).`
      )
    );
  }

  return json;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as VerifyPaymentBody;

    const resultId = (body.resultId || "").trim();
    const feature = (body.feature || "").trim();
    const paymentId = (body.razorpay_payment_id || "").trim();
    const orderId = (body.razorpay_order_id || "").trim();
    const signature = (body.razorpay_signature || "").trim();

    if (!SUPPORTED_FEATURES.has(feature)) {
      return NextResponse.json(
        { ok: false, error: "Unsupported payment feature." },
        { status: 400 }
      );
    }

    if (!resultId) {
      return NextResponse.json(
        { ok: false, error: "Missing resultId." },
        { status: 400 }
      );
    }

    if (!paymentId || !orderId || !signature) {
      return NextResponse.json(
        { ok: false, error: "Missing Razorpay verification fields." },
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

    const expectedSignature = crypto
      .createHmac("sha256", razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (!safeEqualHex(expectedSignature, signature)) {
      return NextResponse.json(
        { ok: false, error: "Invalid Razorpay signature." },
        { status: 400 }
      );
    }

    const payment = await fetchRazorpayPayment(
      paymentId,
      razorpayKeyId,
      razorpayKeySecret
    );

    if (payment.order_id !== orderId) {
      return NextResponse.json(
        { ok: false, error: "Payment/order mismatch." },
        { status: 400 }
      );
    }

    if (!payment.status || !ACCEPTED_PAYMENT_STATUSES.has(payment.status)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Payment is not in an accepted state. Current status: ${payment.status || "unknown"}.`,
        },
        { status: 400 }
      );
    }

    await savePaymentUnlock({
      resultId,
      feature: "generate_all",
      paymentId,
      orderId,
    });

    return NextResponse.json({
      ok: true,
      paymentId,
      orderId,
      status: payment.status,
      feature,
      resultId,
      unlocked: true,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Payment verification failed.";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}