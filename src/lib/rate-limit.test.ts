import { beforeEach, describe, expect, it } from "vitest";
import { clientIp, consume, reset } from "./rate-limit";

describe("consume", () => {
  beforeEach(() => reset());

  it("allows up to the limit and blocks afterwards", () => {
    for (let i = 0; i < 3; i += 1) expect(consume("k", 3, 60_000).allowed).toBe(true);
    const blocked = consume("k", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each key independently", () => {
    consume("a", 1, 60_000);
    expect(consume("a", 1, 60_000).allowed).toBe(false);
    expect(consume("b", 1, 60_000).allowed).toBe(true);
  });

  it("reports the remaining budget", () => {
    expect(consume("c", 5, 60_000).remaining).toBe(4);
    expect(consume("c", 5, 60_000).remaining).toBe(3);
  });

  it("frees the bucket on reset (as after a successful login)", () => {
    consume("d", 1, 60_000);
    expect(consume("d", 1, 60_000).allowed).toBe(false);
    reset("d");
    expect(consume("d", 1, 60_000).allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the first hop of x-forwarded-for", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip and then to a placeholder", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(new Headers())).toBe("desconhecido");
  });
});
