import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { hashPassword, verifyPassword } from "../services/api/src/security.mjs";

test("current scrypt passwords still verify", async () => {
  const stored = await hashPassword("current-password");
  assert.equal(await verifyPassword("current-password", stored), true);
  assert.equal(await verifyPassword("wrong-password", stored), false);
});

test("legacy Spring BCrypt passwords verify without re-registering", async () => {
  const stored = await bcrypt.hash("legacy-password", 4);
  assert.match(stored, /^\$2[aby]\$/u);
  assert.equal(await verifyPassword("legacy-password", stored), true);
  assert.equal(await verifyPassword("wrong-password", stored), false);
});
