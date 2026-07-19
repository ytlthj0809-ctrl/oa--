import crypto from "node:crypto";

export function createAuthRateLimiter({
  maxFailures = 5,
  windowMs = 15 * 60 * 1000,
  blockMs = 15 * 60 * 1000,
  maxEntries = 10_000,
} = {}) {
  const attempts = new Map();

  function keyFor(scope, ipAddress, identity) {
    return crypto
      .createHash("sha256")
      .update(`${scope}:${ipAddress}:${String(identity || "").toLowerCase()}`)
      .digest("hex");
  }

  function prune(now) {
    if (attempts.size < maxEntries) return;
    for (const [key, attempt] of attempts) {
      if (attempt.blockedUntil <= now && now - attempt.firstFailureAt >= windowMs) {
        attempts.delete(key);
      }
    }
    while (attempts.size >= maxEntries) attempts.delete(attempts.keys().next().value);
  }

  function current(scope, ipAddress, identity, now = Date.now()) {
    const key = keyFor(scope, ipAddress, identity);
    const stored = attempts.get(key);
    if (!stored) return { key, failureCount: 0, blockedUntil: 0, blocked: false };
    if (stored.blockedUntil <= now && now - stored.firstFailureAt >= windowMs) {
      attempts.delete(key);
      return { key, failureCount: 0, blockedUntil: 0, blocked: false };
    }
    return { key, ...stored, blocked: stored.blockedUntil > now };
  }

  return {
    check(scope, ipAddress, identity, now = Date.now()) {
      const state = current(scope, ipAddress, identity, now);
      return {
        blocked: state.blocked,
        failureCount: state.failureCount,
        retryAfterSeconds: state.blocked
          ? Math.max(1, Math.ceil((state.blockedUntil - now) / 1000))
          : 0,
      };
    },
    fail(scope, ipAddress, identity, now = Date.now()) {
      prune(now);
      const state = current(scope, ipAddress, identity, now);
      const failureCount = state.failureCount + 1;
      const next = {
        failureCount,
        firstFailureAt: state.failureCount ? state.firstFailureAt : now,
        blockedUntil: failureCount >= maxFailures ? now + blockMs : 0,
      };
      attempts.set(state.key, next);
      return {
        blocked: next.blockedUntil > now,
        failureCount,
        retryAfterSeconds: next.blockedUntil > now ? Math.ceil(blockMs / 1000) : 0,
      };
    },
    clear(scope, ipAddress, identity) {
      attempts.delete(keyFor(scope, ipAddress, identity));
    },
  };
}
