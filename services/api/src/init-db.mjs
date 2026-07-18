import { getPool, closePool } from "./db.mjs";
import { schemaStatements } from "./schema.mjs";
import { hashPassword, randomId } from "./security.mjs";

const pool = getPool();
for (const statement of schemaStatements) await pool.query(statement);
for (let weekday = 0; weekday <= 6; weekday += 1) {
  await pool.query("INSERT IGNORE INTO v2_withdraw_weekday (weekday, is_open) VALUES (?, TRUE)", [weekday]);
}

const username = String(process.env.ADMIN_BOOTSTRAP_USERNAME || process.env.ADMIN_SUPER_ACCOUNT_USERNAME || "").trim();
const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || "");
const suppliedHash = String(process.env.ADMIN_BOOTSTRAP_PASSWORD_HASH || process.env.ADMIN_SUPER_ACCOUNT_PASSWORD_HASH || "");
if (suppliedHash && !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/u.test(suppliedHash)) throw new Error("管理员密码哈希格式无效");
if (username && (password || suppliedHash)) {
  const [existing] = await pool.query("SELECT account_id FROM v2_admin_account WHERE username=?", [username]);
  if (!existing.length) {
    await pool.query(
      "INSERT INTO v2_admin_account (account_id, username, password_hash) VALUES (?, ?, ?)",
      [randomId("adm"), username, suppliedHash || await hashPassword(password)],
    );
  }
}

const [tables] = await pool.query("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'v2_%'");
console.log(JSON.stringify({ ok: true, v2TableCount: Number(tables[0].count) }));
await closePool();
