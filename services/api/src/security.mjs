import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const KEY_LENGTH = 64;

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (error, derivedKey) => error ? reject(error) : resolve(derivedKey));
  });
}

export async function hashPassword(password) {
  if (String(password || "").length < 8) throw new Error("密码至少 8 位");
  const salt = crypto.randomBytes(16);
  const derivedKey = await scrypt(String(password), salt);
  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  if (/^\$2[aby]\$\d{2}\$/u.test(String(stored || ""))) {
    return bcrypt.compare(String(password || ""), String(stored));
  }
  const [algorithm, saltHex, hashHex] = String(stored || "").split(":");
  if (algorithm !== "scrypt" || !saltHex || !hashHex) return false;
  const actual = await scrypt(String(password || ""), Buffer.from(saltHex, "hex"));
  const expected = Buffer.from(hashHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(12).toString("hex")}`;
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function bearerToken(request) {
  const authorization = String(request.headers.authorization || "");
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}
