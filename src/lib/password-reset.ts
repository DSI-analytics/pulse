import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const RESET_CODE_TTL_MINUTES = 10;
export const RESET_CODE_MAX_ATTEMPTS = 5;
export const RESET_CODE_RESEND_SECONDS = 60;

export function generateResetCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashResetCode(code: string, userId: string, secret: string) {
  return createHmac("sha256", secret).update(`${userId}:${code}`).digest("hex");
}

export function resetCodesMatch(code: string, expectedHash: string, userId: string, secret: string) {
  const actual = Buffer.from(hashResetCode(code, userId, secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
