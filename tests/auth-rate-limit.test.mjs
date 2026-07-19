import test from "node:test";
import assert from "node:assert/strict";
import { createAuthRateLimiter } from "../services/api/src/auth-rate-limit.mjs";

test("auth rate limiter blocks the fifth failure and expires after the block window", () => {
  const limiter = createAuthRateLimiter({
    maxFailures: 5,
    windowMs: 60_000,
    blockMs: 120_000,
  });
  for (let count = 1; count <= 4; count += 1) {
    assert.equal(limiter.fail("ADMIN", "1.2.3.4", "user", 1_000).blocked, false);
  }
  const fifth = limiter.fail("ADMIN", "1.2.3.4", "user", 1_000);
  assert.equal(fifth.blocked, true);
  assert.equal(limiter.check("ADMIN", "1.2.3.4", "user", 2_000).blocked, true);
  assert.equal(limiter.check("ADMIN", "1.2.3.4", "user", 122_000).blocked, false);
});

test("auth rate limiter isolates IP, identity and login scope", () => {
  const limiter = createAuthRateLimiter({ maxFailures: 1 });
  limiter.fail("ADMIN", "1.2.3.4", "user-a", 1_000);
  assert.equal(limiter.check("ADMIN", "1.2.3.4", "user-a", 1_000).blocked, true);
  assert.equal(limiter.check("ADMIN", "1.2.3.5", "user-a", 1_000).blocked, false);
  assert.equal(limiter.check("ADMIN", "1.2.3.4", "user-b", 1_000).blocked, false);
  assert.equal(limiter.check("MINIAPP", "1.2.3.4", "user-a", 1_000).blocked, false);
});
