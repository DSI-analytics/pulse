import "server-only";
import { Prisma } from "@prisma/client";

/**
 * Human-facing record numbers, unique per clinic ("EPI-2026-00042").
 *
 * Counting rows and adding one races under concurrency, so the caller retries
 * on the unique-constraint violation instead of trusting the count. Every
 * consumer writes inside a transaction, so a collision costs one retry, never a
 * duplicate number.
 */
export const SEQUENCE_PREFIX = {
  encounter: "EPI",
  prescription: "REC",
  diagnosticOrder: "PED",
  admission: "INT",
  patient: "PAC",
} as const;

export type SequenceKind = keyof typeof SEQUENCE_PREFIX;

/** True when the error is a Prisma unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function formatSequence(kind: SequenceKind, year: number, value: number): string {
  return `${SEQUENCE_PREFIX[kind]}-${year}-${String(value).padStart(5, "0")}`;
}

/**
 * Run `attempt` up to `tries` times, re-running it whenever the write lost a
 * race on a unique number.
 */
export async function withNumberRetry<T>(attempt: (retry: number) => Promise<T>, tries = 5): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < tries; i += 1) {
    try {
      return await attempt(i);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
