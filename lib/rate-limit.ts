import { NextResponse } from "next/server";

type RateLimitOptions = {
  keyPrefix: string;
  limit: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function clientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || forwardedFor || "local";
}

function cleanupExpiredBuckets(now: number) {
  if (buckets.size < 1000) return;
  for (const [key, bucket] of Array.from(buckets.entries())) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(request: Request, options: RateLimitOptions) {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const key = `${options.keyPrefix}:${clientKey(request)}`;
  const current = buckets.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + options.windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count <= options.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    { code: 429, message: "请求过于频繁，请稍后再试。" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(options.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000))
      }
    }
  );
}
