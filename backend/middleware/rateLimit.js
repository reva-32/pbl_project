/**
 * Small in-process fixed-window rate limiter.
 *
 * This is intentionally dependency-free and suitable for a single instance
 * (the current Render deployment).  For a multi-instance deployment, move the
 * counters to Redis or another shared store.
 */
function createRateLimiter({
  windowMs = 60_000,
  max = 60,
  keyGenerator = (req) => req.userId || req.ip || 'anonymous',
  message = 'Too many requests. Please wait a moment and try again.',
} = {}) {
  const buckets = new Map();

  // Opportunistic cleanup so the map cannot grow without bound.
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, Math.max(windowMs, 60_000));
  if (timer.unref) timer.unref();

  return function rateLimiter(req, res, next) {
    const key = keyGenerator(req);
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    return next();
  };
}

module.exports = { createRateLimiter };
