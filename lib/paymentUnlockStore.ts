import { Redis } from "@upstash/redis";

type UnlockFeature = "generate_all";

type UnlockRecord = {
  unlocked: true;
  feature: UnlockFeature;
  resultId: string;
  paymentId: string;
  orderId: string;
  paidAt: string;
};

const redis = Redis.fromEnv();

function unlockKey(resultId: string, feature: UnlockFeature) {
  return `payment_unlock:${feature}:${resultId}`;
}

export async function savePaymentUnlock(params: {
  resultId: string;
  feature: UnlockFeature;
  paymentId: string;
  orderId: string;
}) {
  const record: UnlockRecord = {
    unlocked: true,
    feature: params.feature,
    resultId: params.resultId,
    paymentId: params.paymentId,
    orderId: params.orderId,
    paidAt: new Date().toISOString(),
  };

  await redis.set(unlockKey(params.resultId, params.feature), record);
  return record;
}

export async function getPaymentUnlock(
  resultId: string,
  feature: UnlockFeature
): Promise<UnlockRecord | null> {
  const data = await redis.get<UnlockRecord>(unlockKey(resultId, feature));
  return data ?? null;
}