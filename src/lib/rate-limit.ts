export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
};

type Bucket = {
  stamps: number[];
};

export type KeyedRateLimiter = {
  check: (key: string) => RateLimitDecision;
  size: () => number;
};

/**
 * Bounded per-key sliding-window rate limiter safe for serverless/edge isolates.
 * Evicts oldest entries once `maxKeys` is exceeded to prevent memory exhaustion.
 */
export function createKeyedRateLimiter(opts: {
  limit: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
}): KeyedRateLimiter {
  const { limit, windowMs, maxKeys = 5_000, now = Date.now } = opts;
  const buckets = new Map<string, Bucket>();

  const evictIfNeeded = (t: number) => {
    if (buckets.size < maxKeys) return;
    for (const [k, b] of buckets) {
      if (!b.stamps.length || t - (b.stamps[b.stamps.length - 1] ?? 0) >= windowMs) {
        buckets.delete(k);
      }
      if (buckets.size < maxKeys * 0.8) break;
    }
    if (buckets.size >= maxKeys) {
      const firstKey = buckets.keys().next().value;
      if (firstKey !== undefined) buckets.delete(firstKey);
    }
  };

  return {
    check(key: string): RateLimitDecision {
      const t = now();
      let bucket = buckets.get(key);
      if (!bucket) {
        evictIfNeeded(t);
        bucket = { stamps: [] };
        buckets.set(key, bucket);
      }

      let drop = 0;
      while (drop < bucket.stamps.length && t - (bucket.stamps[drop] ?? 0) >= windowMs) {
        drop++;
      }
      if (drop > 0) bucket.stamps.splice(0, drop);

      if (bucket.stamps.length >= limit) {
        const oldest = bucket.stamps[0] ?? t;
        const retryAfterMs = Math.max(1_000, windowMs - (t - oldest));
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: Math.ceil(retryAfterMs / 1_000),
        };
      }

      bucket.stamps.push(t);
      return {
        allowed: true,
        remaining: Math.max(0, limit - bucket.stamps.length),
        retryAfterSec: 0,
      };
    },
    size: () => buckets.size,
  };
}

export function extractClientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

/** Public API & SSR route guard: 120 requests/min per IP on /api/* and _serverFn calls. */
export const publicApiRateLimiter = createKeyedRateLimiter({
  limit: 120,
  windowMs: 60_000,
  maxKeys: 10_000,
});

/** Tighter rate limit for auth/webhook/cron probing: 30 requests/min per IP. */
export const sensitiveEndpointRateLimiter = createKeyedRateLimiter({
  limit: 30,
  windowMs: 60_000,
  maxKeys: 5_000,
});

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  if (!headers.has("x-content-type-options")) {
    headers.set("x-content-type-options", "nosniff");
  }
  if (!headers.has("referrer-policy")) {
    headers.set("referrer-policy", "strict-origin-when-cross-origin");
  }
  if (!headers.has("x-frame-options")) {
    headers.set("x-frame-options", "SAMEORIGIN");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function hydrateEnvFromBindings(env: unknown): void {
  if (!env || typeof env !== "object") return;
  const record = env as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && value.length > 0 && !process.env[key]) {
      process.env[key] = value;
    }
  }
}
