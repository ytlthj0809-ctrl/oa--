import { getPool, closePool } from "./db.mjs";
import { schemaStatements } from "./schema.mjs";
import { hashPassword, randomId } from "./security.mjs";

const pool = getPool();
for (const statement of schemaStatements) await pool.query(statement);

const [legacyLoginColumns] = await pool.query(
  "SELECT 1 FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='v2_anchor' AND column_name='legacy_login_account'",
);
if (!legacyLoginColumns.length) {
  await pool.query("ALTER TABLE v2_anchor ADD COLUMN legacy_login_account VARCHAR(255) NULL AFTER bixin_user_id");
}
const [legacyLoginIndexes] = await pool.query(
  "SELECT 1 FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='v2_anchor' AND index_name='uk_v2_anchor_legacy_login'",
);
if (!legacyLoginIndexes.length) {
  await pool.query("ALTER TABLE v2_anchor ADD UNIQUE KEY uk_v2_anchor_legacy_login (legacy_login_account)");
}
const [bixinColumns] = await pool.query(
  "SELECT is_nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='v2_anchor' AND column_name='bixin_user_id'",
);
if (bixinColumns[0]?.is_nullable !== "YES") {
  await pool.query("ALTER TABLE v2_anchor MODIFY bixin_user_id VARCHAR(20) NULL");
}
await pool.query(
  `INSERT IGNORE INTO v2_anchor_bixin_alias (bixin_user_id, anchor_id, is_primary)
   SELECT bixin_user_id, anchor_id, TRUE FROM v2_anchor WHERE bixin_user_id IS NOT NULL`,
);
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
