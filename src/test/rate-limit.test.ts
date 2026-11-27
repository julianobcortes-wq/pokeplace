import { describe, expect, it } from "vitest";
import {
  createKeyedRateLimiter,
  extractClientIp,
  hydrateEnvFromBindings,
  withSecurityHeaders,
} from "@/lib/rate-limit";

describe("Phase 0 rate limiting, security headers & Cloudflare env hydration", () => {
  it("enforces sliding window rate limits per key and releases after window expires", () => {
    let clock = 10_000;
    const limiter = createKeyedRateLimiter({ limit: 3, windowMs: 60_000, now: () => clock });

    expect(limiter.check("1.2.3.4")).toEqual({ allowed: true, remaining: 2, retryAfterSec: 0 });
    expect(limiter.check("1.2.3.4")).toEqual({ allowed: true, remaining: 1, retryAfterSec: 0 });
    expect(limiter.check("1.2.3.4")).toEqual({ allowed: true, remaining: 0, retryAfterSec: 0 });

    const blocked = limiter.check("1.2.3.4");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(60);

    // Other IP is unaffected
    expect(limiter.check("5.6.7.8").allowed).toBe(true);

    // After 60s, oldest entry slides out
    clock += 60_001;
    expect(limiter.check("1.2.3.4").allowed).toBe(true);
  });

  it("bounds bucket count to prevent memory exhaustion under spoofed IPs", () => {
    const limiter = createKeyedRateLimiter({ limit: 5, windowMs: 60_000, maxKeys: 10 });
    for (let i = 0; i < 30; i++) {
      limiter.check(`ip-${i}`);
    }
    expect(limiter.size()).toBeLessThanOrEqual(10);
  });

  it("extracts client IP prioritizing Cloudflare cf-connecting-ip over x-forwarded-for", () => {
    const req1 = new Request("https://pokeplace.com.br/api/health", {
      headers: { "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
    });
    expect(extractClientIp(req1)).toBe("203.0.113.9");

    const req2 = new Request("https://pokeplace.com.br/api/health", {
      headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" },
    });
    expect(extractClientIp(req2)).toBe("198.51.100.7");

    expect(extractClientIp(new Request("https://pokeplace.com.br/api/health"))).toBe("unknown");
  });

  it("attaches security headers without overriding existing headers", () => {
    const base = new Response("ok", { status: 200, headers: { "x-frame-options": "DENY" } });
    const secured = withSecurityHeaders(base);
    expect(secured.headers.get("x-content-type-options")).toBe("nosniff");
    expect(secured.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(secured.headers.get("x-frame-options")).toBe("DENY");
  });

  it("hydrates missing process.env values from Cloudflare Worker env bindings without overwriting existing keys", () => {
    const keyNew = "__TEST_CF_NEW_VAR__";
    const keyExisting = "__TEST_CF_EXISTING_VAR__";
    process.env[keyExisting] = "original";
    delete process.env[keyNew];
    try {
      hydrateEnvFromBindings({
        [keyNew]: "from-worker",
        [keyExisting]: "override",
        nonString: 123,
      });
      expect(process.env[keyNew]).toBe("from-worker");
      expect(process.env[keyExisting]).toBe("original");
    } finally {
      delete process.env[keyNew];
      delete process.env[keyExisting];
    }
  });
});
