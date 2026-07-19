import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { getPool, transaction } from "./db.mjs";
import {
  MIN_WITHDRAW_CENTS,
  evaluateWithdrawWindow,
  normalizeBixinId,
  shanghaiParts,
} from "./business.mjs";
import { parseDailyWorkbook } from "./importer.mjs";
import { buildPayoutFiles } from "./payout.mjs";
import { bearerToken, hashPassword, randomId, sha256, verifyPassword } from "./security.mjs";
import { storePrivateFile } from "./storage.mjs";
import { createYzhPresign, decodeYzhCallback, mapYzhSignStatus, maskYzhIdentity, resolveYzhConfig } from "./yzh-provider.mjs";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(currentDirectory, "../../..");
const adminDirectory = path.join(rootDirectory, "apps/admin");
const app = express();
const pool = getPool();
const loginAttempts = new Map();

app.disable("x-powered-by");
app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if (["production", "formal"].includes(String(process.env.NODE_ENV || process.env.APP_ENV || "").toLowerCase())) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.setHeader("Cache-Control", request.path.startsWith("/admin/assets/") ? "public, max-age=86400" : "no-store");
  next();
});

function ipAddress(request) {
  return String(request.headers["x-forwarded-for"] || request.socket.remoteAddress || "").split(",")[0].trim().slice(0, 64);
}

function apiError(code, message, status = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function asyncRoute(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response)).catch(next);
}

function ok(response, data, status = 200) {
  response.status(status).json({ ok: true, data });
}

async function audit({ connection = pool, actorType, actorId, action, targetType, targetId, detail = {}, request }) {
  await connection.query(
    "INSERT INTO v2_audit_log (actor_type, actor_id, action, target_type, target_id, detail_json, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [actorType, actorId, action, targetType, String(targetId), JSON.stringify(detail), request ? ipAddress(request) : ""],
  );
}

function iso(value) {
  return value ? new Date(value).toISOString() : "";
}

async function requireAdmin(request, response, next) {
  try {
    const token = bearerToken(request);
    if (!token) throw apiError("AUTH_REQUIRED", "请先登录", 401);
    const tokenHash = sha256(token);
    const [rows] = await pool.query(
      `SELECT s.account_id, s.expires_at, s.idle_expires_at, a.username, a.status
       FROM v2_admin_session s JOIN v2_admin_account a ON a.account_id=s.account_id
       WHERE s.token_hash=? LIMIT 1`,
      [tokenHash],
    );
    const session = rows[0];
    const now = Date.now();
    if (!session || session.status !== "ACTIVE" || new Date(session.expires_at).getTime() <= now || new Date(session.idle_expires_at).getTime() <= now) {
      await pool.query("DELETE FROM v2_admin_session WHERE token_hash=?", [tokenHash]);
      throw apiError("AUTH_REQUIRED", "登录已失效，请重新登录", 401);
    }
    await pool.query(
      "UPDATE v2_admin_session SET last_seen_at=NOW(3), idle_expires_at=LEAST(expires_at, DATE_ADD(NOW(3), INTERVAL 30 MINUTE)) WHERE token_hash=?",
      [tokenHash],
    );
    request.admin = { accountId: session.account_id, username: session.username, tokenHash };
    next();
  } catch (error) {
    next(error);
  }
}

async function requireMiniapp(request, response, next) {
  try {
    const token = String(request.headers["x-miniapp-token"] || "");
    if (!token) throw apiError("AUTH_REQUIRED", "请先登录", 401);
    const [rows] = await pool.query(
      `SELECT s.anchor_id, s.expires_at, a.bixin_user_id, a.display_name, a.status
       FROM v2_miniapp_session s JOIN v2_anchor a ON a.anchor_id=s.anchor_id
       WHERE s.token_hash=? LIMIT 1`,
      [sha256(token)],
    );
    const session = rows[0];
    if (!session || session.status !== "ACTIVE" || new Date(session.expires_at).getTime() <= Date.now()) throw apiError("AUTH_REQUIRED", "登录已失效，请重新登录", 401);
    request.anchor = { anchorId: session.anchor_id, bixinUserId: session.bixin_user_id, displayName: session.display_name };
    next();
  } catch (error) {
    next(error);
  }
}

function assertOwnAnchor(request) {
  const requested = String(request.query.anchorId || request.body?.anchorId || request.params.anchorId || "");
  if (requested && requested !== request.anchor.anchorId) throw apiError("AUTH_SCOPE_DENIED", "无权访问其他主播数据", 403);
  return request.anchor.anchorId;
}

async function issueMiniappSession(anchorId) {
  const token = randomId("mas");
  const expireAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    "INSERT INTO v2_miniapp_session (token_hash, anchor_id, expires_at) VALUES (?, ?, ?)",
    [sha256(token), anchorId, expireAt],
  );
  const [protocols] = await pool.query("SELECT COUNT(*) AS count FROM v2_protocol_agreement WHERE anchor_id=?", [anchorId]);
  return {
    anchorId,
    token,
    expireAt: expireAt.toISOString(),
    loginStatus: "LOGGED_IN",
    protocolStatus: Number(protocols[0].count) > 0 ? "AGREED" : "PENDING",
    bindingStatus: "BOUND",
  };
}

async function calendarFor(date = new Date()) {
  const parts = shanghaiParts(date);
  const [[weekday], [override]] = await Promise.all([
    pool.query("SELECT is_open FROM v2_withdraw_weekday WHERE weekday=?", [parts.weekday]),
    pool.query("SELECT is_open FROM v2_withdraw_date_override WHERE business_date=?", [parts.date]),
  ]);
  return {
    parts,
    weekdayOpen: weekday.length ? Boolean(weekday[0].is_open) : true,
    dateOverride: override.length ? Boolean(override[0].is_open) : null,
  };
}

async function currentWithdrawWindow(date = new Date()) {
  const calendar = await calendarFor(date);
  return evaluateWithdrawWindow({ now: date, weekdayOpen: calendar.weekdayOpen, dateOverride: calendar.dateOverride });
}

function parseBase64File(body) {
  const fileName = String(body.fileName || "").trim();
  const contentBase64 = String(body.contentBase64 || "").replace(/^data:.*?;base64,/, "");
  if (!fileName || !contentBase64) throw apiError("FILE_REQUIRED", "请选择 Excel 文件");
  const buffer = Buffer.from(contentBase64, "base64");
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw apiError("FILE_SIZE_INVALID", "文件大小必须在 20MB 以内");
  return { fileName, buffer };
}

async function parseDailyFile(file) {
  try {
    return await parseDailyWorkbook(file);
  } catch (error) {
    error.status = 400;
    error.code ||= "IMPORT_FILE_INVALID";
    throw error;
  }
}

async function postPendingIncomeForAnchor(connection, anchorId, bixinUserId) {
  const [rows] = await connection.query(
    `SELECT r.import_id, r.amount_cents
     FROM v2_import_row r JOIN v2_import_batch b ON b.import_id=r.import_id AND b.status='ACTIVE'
     WHERE r.bixin_user_id=? AND r.posted_at IS NULL FOR UPDATE`,
    [bixinUserId],
  );
  await connection.query("INSERT IGNORE INTO v2_balance_account (anchor_id, balance_cents) VALUES (?, 0)", [anchorId]);
  for (const row of rows) {
    const referenceId = `${row.import_id}:${bixinUserId}`;
    const [accountRows] = await connection.query("SELECT balance_cents FROM v2_balance_account WHERE anchor_id=? FOR UPDATE", [anchorId]);
    const nextBalance = Number(accountRows[0].balance_cents) + Number(row.amount_cents);
    await connection.query("UPDATE v2_balance_account SET balance_cents=? WHERE anchor_id=?", [nextBalance, anchorId]);
    await connection.query(
      "INSERT IGNORE INTO v2_balance_flow (flow_id, anchor_id, direction, amount_cents, balance_after_cents, flow_type, reference_id) VALUES (?, ?, 'IN', ?, ?, 'DAILY_INCOME', ?)",
      [randomId("flow"), anchorId, row.amount_cents, nextBalance, referenceId],
    );
    await connection.query("UPDATE v2_import_row SET anchor_id=?, posted_at=NOW(3) WHERE import_id=? AND bixin_user_id=?", [anchorId, row.import_id, bixinUserId]);
  }
  return rows.reduce((sum, row) => sum + Number(row.amount_cents), 0);
}

async function findAnchorByBixinId(connection, bixinUserId) {
  const [rows] = await connection.query(
    `SELECT a.anchor_id
     FROM v2_anchor_bixin_alias m
     JOIN v2_anchor a ON a.anchor_id=m.anchor_id
     WHERE m.bixin_user_id=?
     LIMIT 1`,
    [bixinUserId],
  );
  if (rows.length) return rows[0];
  const [legacyRows] = await connection.query("SELECT anchor_id FROM v2_anchor WHERE bixin_user_id=? LIMIT 1", [bixinUserId]);
  return legacyRows[0] || null;
}

app.get("/health/live", (request, response) => ok(response, { status: "live", service: "jiayin-withdraw-v2" }));
app.get("/health/ready", asyncRoute(async (request, response) => {
  await pool.query("SELECT 1");
  ok(response, { status: "ready", persistence: "mysql" });
}));
app.get("/health", asyncRoute(async (request, response) => {
  const [tables] = await pool.query("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name LIKE 'v2_%'");
  ok(response, { status: "ready", persistence: { provider: "mysql", tables: Number(tables[0].count) } });
}));

app.post("/api/admin/v2/auth/login", asyncRoute(async (request, response) => {
  const username = String(request.body.username || "").trim();
  const password = String(request.body.password || "");
  const key = `${ipAddress(request)}:${username}`;
  const attempt = loginAttempts.get(key) || { count: 0, blockedUntil: 0 };
  if (attempt.blockedUntil > Date.now()) throw apiError("LOGIN_RATE_LIMITED", "登录失败次数过多，请稍后再试", 429);
  const [rows] = await pool.query("SELECT account_id, username, password_hash, status FROM v2_admin_account WHERE username=? LIMIT 1", [username]);
  const account = rows[0];
  if (!account || account.status !== "ACTIVE" || !await verifyPassword(password, account.password_hash)) {
    const count = attempt.count + 1;
    loginAttempts.set(key, { count, blockedUntil: count >= 5 ? Date.now() + 15 * 60 * 1000 : 0 });
    throw apiError("LOGIN_FAILED", "用户名或密码错误", 401);
  }
  loginAttempts.delete(key);
  const token = randomId("ads");
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const idleExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await pool.query(
    "INSERT INTO v2_admin_session (token_hash, account_id, expires_at, idle_expires_at, last_seen_at) VALUES (?, ?, ?, ?, NOW(3))",
    [sha256(token), account.account_id, expiresAt, idleExpiresAt],
  );
  await audit({ actorType: "ADMIN", actorId: account.account_id, action: "ADMIN_LOGIN", targetType: "SESSION", targetId: sha256(token).slice(0, 16), request });
  ok(response, { token, expiresAt: expiresAt.toISOString(), idleMinutes: 30, account: { accountId: account.account_id, username: account.username } });
}));

app.get("/api/admin/v2/session", requireAdmin, asyncRoute(async (request, response) => ok(response, { account: request.admin })));
app.post("/api/admin/v2/auth/logout", requireAdmin, asyncRoute(async (request, response) => {
  await pool.query("DELETE FROM v2_admin_session WHERE token_hash=?", [request.admin.tokenHash]);
  await audit({ actorType: "ADMIN", actorId: request.admin.accountId, action: "ADMIN_LOGOUT", targetType: "SESSION", targetId: request.admin.tokenHash.slice(0, 16), request });
  ok(response, { loggedOut: true });
}));

app.get("/api/admin/v2/dashboard", requireAdmin, asyncRoute(async (request, response) => {
  const today = shanghaiParts().date;
  const [calendar, payment, withdrawals, imports, balances] = await Promise.all([
    currentWithdrawWindow(),
    pool.query("SELECT COUNT(*) AS count FROM v2_payment_request WHERE review_status='PENDING_REVIEW'"),
    pool.query("SELECT status, COUNT(*) AS count, COALESCE(SUM(amount_cents),0) AS amount_cents FROM v2_withdraw_apply WHERE business_date=? GROUP BY status", [today]),
    pool.query("SELECT import_id, business_date, file_name, row_count, total_amount_cents, created_at FROM v2_import_batch WHERE status='ACTIVE' ORDER BY business_date DESC LIMIT 5"),
    pool.query("SELECT COUNT(*) AS count, COALESCE(SUM(balance_cents),0) AS total_cents FROM v2_balance_account"),
  ]);
  ok(response, {
    serverDate: today,
    withdrawWindow: calendar,
    pendingPaymentCount: Number(payment[0][0].count),
    withdrawalSummary: withdrawals[0],
    recentImports: imports[0],
    balanceSummary: { accountCount: Number(balances[0][0].count), totalCents: Number(balances[0][0].total_cents) },
  });
}));

app.get("/api/admin/v2/calendar", requireAdmin, asyncRoute(async (request, response) => {
  const [weekdays, overrides] = await Promise.all([
    pool.query("SELECT weekday, is_open FROM v2_withdraw_weekday ORDER BY weekday"),
    pool.query("SELECT business_date, is_open, updated_at FROM v2_withdraw_date_override WHERE business_date>=DATE_SUB(CURDATE(), INTERVAL 31 DAY) ORDER BY business_date"),
  ]);
  ok(response, { weekdays: weekdays[0], overrides: overrides[0] });
}));

app.put("/api/admin/v2/calendar/weekdays", requireAdmin, asyncRoute(async (request, response) => {
  const weekdays = Array.isArray(request.body.weekdays) ? request.body.weekdays : [];
  if (weekdays.length !== 7 || weekdays.some((value) => typeof value !== "boolean")) throw apiError("CALENDAR_INVALID", "必须提供周日至周六共 7 个设置");
  const now = shanghaiParts();
  if (now.hour >= 8) {
    const [current] = await pool.query("SELECT is_open FROM v2_withdraw_weekday WHERE weekday=?", [now.weekday]);
    if (current.length && Boolean(current[0].is_open) !== weekdays[now.weekday]) throw apiError("CALENDAR_TODAY_LOCKED", "当天 08:00 后不能再通过周规则改变当天状态", 409);
  }
  await transaction(async (connection) => {
    for (let weekday = 0; weekday < 7; weekday += 1) await connection.query("UPDATE v2_withdraw_weekday SET is_open=? WHERE weekday=?", [weekdays[weekday], weekday]);
    await audit({ connection, actorType: "ADMIN", actorId: request.admin.accountId, action: "WITHDRAW_WEEKDAY_UPDATE", targetType: "CALENDAR", targetId: "WEEKLY", detail: { weekdays }, request });
  });
  ok(response, { updated: true });
}));

app.put("/api/admin/v2/calendar/override/:date", requireAdmin, asyncRoute(async (request, response) => {
  const date = String(request.params.date || "");
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || typeof request.body.isOpen !== "boolean") throw apiError("CALENDAR_INVALID", "日期或状态无效");
  const now = shanghaiParts();
  if (date === now.date && now.hour >= 8) throw apiError("CALENDAR_TODAY_LOCKED", "当天 08:00 后不能再修改当天规则");
  await pool.query(
    "INSERT INTO v2_withdraw_date_override (business_date, is_open, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE is_open=VALUES(is_open), updated_by=VALUES(updated_by)",
    [date, request.body.isOpen, request.admin.accountId],
  );
  await audit({ actorType: "ADMIN", actorId: request.admin.accountId, action: "WITHDRAW_DATE_OVERRIDE", targetType: "CALENDAR", targetId: date, detail: { isOpen: request.body.isOpen }, request });
  ok(response, { date, isOpen: request.body.isOpen });
}));

app.post("/api/admin/v2/imports/preview", requireAdmin, asyncRoute(async (request, response) => {
  const file = parseBase64File(request.body);
  const parsed = await parseDailyFile(file);
  const [duplicateFile, activeDate] = await Promise.all([
    pool.query("SELECT import_id FROM v2_import_batch WHERE file_hash=? AND status='ACTIVE' LIMIT 1", [parsed.fileHash]),
    pool.query("SELECT import_id, file_name FROM v2_import_batch WHERE business_date=? AND status='ACTIVE' LIMIT 1", [parsed.businessDate]),
  ]);
  if (duplicateFile[0].length) throw apiError("IMPORT_DUPLICATE_FILE", "该文件正在生效，请先整体删除", 409);
  if (activeDate[0].length) throw apiError("IMPORT_DATE_EXISTS", "该日期已有生效文件，请先整体删除", 409, activeDate[0][0]);
  ok(response, { businessDate: parsed.businessDate, fileName: parsed.fileName, fileHash: parsed.fileHash, ...parsed.summary });
}));

app.post("/api/admin/v2/imports/confirm", requireAdmin, asyncRoute(async (request, response) => {
  const file = parseBase64File(request.body);
  const parsed = await parseDailyFile(file);
  if (String(request.body.expectedFileHash || "") !== parsed.fileHash || String(request.body.businessDate || "") !== parsed.businessDate) throw apiError("IMPORT_PREVIEW_STALE", "文件或日期已变化，请重新预览");
  const [duplicateFile, duplicateDate] = await Promise.all([
    pool.query("SELECT import_id FROM v2_import_batch WHERE file_hash=? AND status='ACTIVE' LIMIT 1", [parsed.fileHash]),
    pool.query("SELECT import_id FROM v2_import_batch WHERE business_date=? AND status='ACTIVE' LIMIT 1", [parsed.businessDate]),
  ]);
  if (duplicateFile[0].length) throw apiError("IMPORT_DUPLICATE_FILE", "该文件正在生效，请先整体删除", 409);
  if (duplicateDate[0].length) throw apiError("IMPORT_DATE_EXISTS", "该日期已有生效文件，请先整体删除", 409);
  const importId = randomId("imp");
  const objectKey = `v2/daily/${parsed.businessDate}/${importId}-${parsed.fileName.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")}`;
  await storePrivateFile({ key: objectKey, body: file.buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const result = await transaction(async (connection) => {
    const [existing] = await connection.query("SELECT import_id FROM v2_import_batch WHERE business_date=? AND status='ACTIVE' FOR UPDATE", [parsed.businessDate]);
    if (existing.length) throw apiError("IMPORT_DATE_EXISTS", "该日期已有生效文件，请先整体删除", 409);
    await connection.query(
      `INSERT INTO v2_import_batch
       (import_id, business_date, file_name, file_hash, object_key, row_count, positive_count, zero_count, total_star, total_amount_cents, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [importId, parsed.businessDate, parsed.fileName, parsed.fileHash, objectKey, parsed.summary.rowCount, parsed.summary.positiveCount, parsed.summary.zeroCount, parsed.summary.totalStar, parsed.summary.totalAmountCents, request.admin.accountId],
    );
    for (const row of parsed.rows) {
      await connection.query(
        "INSERT IGNORE INTO v2_eligibility (bixin_user_id, nickname, first_seen_date, first_import_id) VALUES (?, ?, ?, ?)",
        [row.bixinUserId, row.nickname, parsed.businessDate, importId],
      );
      const anchor = await findAnchorByBixinId(connection, row.bixinUserId);
      const anchorId = anchor?.anchor_id || null;
      await connection.query(
        "INSERT INTO v2_import_row (import_id, bixin_user_id, nickname, star_value, amount_cents, anchor_id) VALUES (?, ?, ?, ?, ?, ?)",
        [importId, row.bixinUserId, row.nickname, row.starValue, row.amountCents, anchorId],
      );
      if (anchorId) await postPendingIncomeForAnchor(connection, anchorId, row.bixinUserId);
    }
    await audit({ connection, actorType: "ADMIN", actorId: request.admin.accountId, action: "DAILY_IMPORT_CONFIRM", targetType: "IMPORT", targetId: importId, detail: parsed.summary, request });
    return { importId, businessDate: parsed.businessDate, ...parsed.summary };
  });
  ok(response, result, 201);
}));

app.get("/api/admin/v2/imports", requireAdmin, asyncRoute(async (request, response) => {
  const [rows] = await pool.query("SELECT * FROM v2_import_batch ORDER BY business_date DESC, created_at DESC LIMIT 200");
  ok(response, rows);
}));

app.delete("/api/admin/v2/imports/:importId", requireAdmin, asyncRoute(async (request, response) => {
  const importId = String(request.params.importId || "");
  if (request.body.confirmText !== "删除") throw apiError("DELETE_CONFIRMATION_REQUIRED", "请输入“删除”确认");
  const result = await transaction(async (connection) => {
    const [batches] = await connection.query("SELECT * FROM v2_import_batch WHERE import_id=? AND status='ACTIVE' FOR UPDATE", [importId]);
    const batch = batches[0];
    if (!batch) throw apiError("IMPORT_NOT_FOUND", "没有找到生效中的导入记录", 404);
    const [posted] = await connection.query(
      "SELECT anchor_id, SUM(amount_cents) AS amount_cents FROM v2_import_row WHERE import_id=? AND posted_at IS NOT NULL GROUP BY anchor_id",
      [importId],
    );
    const [activeWithdrawals] = await connection.query(
      `SELECT DISTINCT r.anchor_id
       FROM v2_import_row r JOIN v2_withdraw_apply w ON w.anchor_id=r.anchor_id AND w.created_at>=r.posted_at AND w.status<>'REJECTED'
       WHERE r.import_id=? AND r.posted_at IS NOT NULL`,
      [importId],
    );
    const [negativeAdjustments] = await connection.query(
      `SELECT DISTINCT r.anchor_id
       FROM v2_import_row r JOIN v2_balance_flow f ON f.anchor_id=r.anchor_id AND f.created_at>=r.posted_at
       WHERE r.import_id=? AND r.posted_at IS NOT NULL AND f.flow_type='MANUAL_ADJUSTMENT' AND f.direction='OUT'`,
      [importId],
    );
    const blockers = [];
    for (const row of [...activeWithdrawals, ...negativeAdjustments]) {
      if (!blockers.some((item) => item.anchorId === row.anchor_id)) blockers.push({ anchorId: row.anchor_id, reason: "导入后发生过未撤销的资金支出" });
    }
    for (const row of posted) {
      const [accounts] = await connection.query("SELECT balance_cents FROM v2_balance_account WHERE anchor_id=? FOR UPDATE", [row.anchor_id]);
      const balance = Number(accounts[0]?.balance_cents || 0);
      if (balance < Number(row.amount_cents) && !blockers.some((item) => item.anchorId === row.anchor_id)) blockers.push({ anchorId: row.anchor_id, balanceCents: balance, requiredCents: Number(row.amount_cents), reason: "当前余额不足以撤销本批收入" });
    }
    if (blockers.length) throw apiError("IMPORT_DELETE_FUNDS_USED", "部分收入已经被资金动作使用，不能删除", 409, blockers);
    for (const row of posted) {
      const [accounts] = await connection.query("SELECT balance_cents FROM v2_balance_account WHERE anchor_id=? FOR UPDATE", [row.anchor_id]);
      const nextBalance = Number(accounts[0].balance_cents) - Number(row.amount_cents);
      await connection.query("UPDATE v2_balance_account SET balance_cents=? WHERE anchor_id=?", [nextBalance, row.anchor_id]);
      await connection.query(
        "INSERT INTO v2_balance_flow (flow_id, anchor_id, direction, amount_cents, balance_after_cents, flow_type, reference_id, reason) VALUES (?, ?, 'OUT', ?, ?, 'IMPORT_DELETE', ?, '整体删除日数据')",
        [randomId("flow"), row.anchor_id, row.amount_cents, nextBalance, importId],
      );
    }
    await connection.query("UPDATE v2_import_batch SET status='DELETED', deleted_by=?, deleted_at=NOW(3) WHERE import_id=?", [request.admin.accountId, importId]);
    await audit({ connection, actorType: "ADMIN", actorId: request.admin.accountId, action: "DAILY_IMPORT_DELETE", targetType: "IMPORT", targetId: importId, detail: { businessDate: batch.business_date, rowCount: batch.row_count, revertedCents: batch.total_amount_cents }, request });
    return { importId, status: "DELETED", revertedCents: Number(batch.total_amount_cents) };
  });
  ok(response, result);
}));

app.get("/api/admin/v2/anchors", requireAdmin, asyncRoute(async (request, response) => {
  const query = String(request.query.q || "").trim();
  const requestedPage = Number.parseInt(request.query.page, 10);
  const requestedPageSize = Number.parseInt(request.query.pageSize, 10);
  const pageSize = [30, 50, 100].includes(requestedPageSize) ? requestedPageSize : 30;
  const sort = ["balance_desc", "balance_asc"].includes(request.query.sort) ? request.query.sort : "balance_desc";
  const orderBy = sort === "balance_asc"
    ? "COALESCE(b.balance_cents,0) ASC, a.created_at DESC"
    : "COALESCE(b.balance_cents,0) DESC, a.created_at DESC";
  const where = query ? "WHERE a.bixin_user_id LIKE ? OR EXISTS (SELECT 1 FROM v2_anchor_bixin_alias m WHERE m.anchor_id=a.anchor_id AND m.bixin_user_id LIKE ?) OR a.legacy_login_account LIKE ? OR a.display_name LIKE ? OR a.mobile LIKE ?" : "";
  const params = query ? [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`] : [];
  const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM v2_anchor a ${where}`, params);
  const total = Number(countRows[0]?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1, totalPages);
  const [rows] = await pool.query(
    `SELECT a.anchor_id, a.bixin_user_id, a.legacy_login_account, a.display_name, a.mobile, a.status, a.created_at,
            COALESCE(b.balance_cents,0) AS balance_cents,
            COALESCE(p.review_status,'MISSING') AS payment_status,
            COALESCE(y.sign_status,'UNSIGNED') AS sign_status
     FROM v2_anchor a
     LEFT JOIN v2_balance_account b ON b.anchor_id=a.anchor_id
     LEFT JOIN v2_payment_request p ON p.request_id=(SELECT request_id FROM v2_payment_request WHERE anchor_id=a.anchor_id ORDER BY created_at DESC LIMIT 1)
     LEFT JOIN v2_yzh_contract y ON y.anchor_id=a.anchor_id
     ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );
  ok(response, { rows, page, pageSize, total, totalPages, sort });
}));

app.get("/api/admin/v2/anchors/:anchorId", requireAdmin, asyncRoute(async (request, response) => {
  const anchorId = String(request.params.anchorId || "");
  const [anchors, payments, flows, withdrawals] = await Promise.all([
    pool.query(`SELECT a.anchor_id, a.bixin_user_id, a.legacy_login_account, a.display_name, a.mobile, a.status, a.created_at,
      COALESCE(b.balance_cents,0) AS balance_cents, COALESCE(y.sign_status,'UNSIGNED') AS sign_status
      FROM v2_anchor a LEFT JOIN v2_balance_account b ON b.anchor_id=a.anchor_id LEFT JOIN v2_yzh_contract y ON y.anchor_id=a.anchor_id WHERE a.anchor_id=?`, [anchorId]),
    pool.query("SELECT request_id, real_name, id_card_no, payment_mobile, bank_card_no, review_status, review_reason, created_at, reviewed_at FROM v2_payment_request WHERE anchor_id=? ORDER BY created_at DESC LIMIT 20", [anchorId]),
    pool.query("SELECT flow_id, direction, amount_cents, balance_after_cents, flow_type, reason, created_at FROM v2_balance_flow WHERE anchor_id=? ORDER BY created_at DESC LIMIT 100", [anchorId]),
    pool.query("SELECT apply_id, business_date, amount_cents, status, reject_reason, created_at, resolved_at FROM v2_withdraw_apply WHERE anchor_id=? ORDER BY created_at DESC LIMIT 100", [anchorId]),
  ]);
  if (!anchors[0].length) throw apiError("ANCHOR_NOT_FOUND", "主播不存在", 404);
  await audit({ actorType: "ADMIN", actorId: request.admin.accountId, action: "ANCHOR_FULL_VIEW", targetType: "ANCHOR", targetId: anchorId, detail: { paymentRecordCount: payments[0].length }, request });
  ok(response, { anchor: anchors[0][0], paymentRequests: payments[0], balanceFlows: flows[0], withdrawals: withdrawals[0] });
}));

app.post("/api/admin/v2/anchors/:anchorId/balance-adjustments", requireAdmin, asyncRoute(async (request, response) => {
  const anchorId = String(request.params.anchorId || "");
  const amountCents = Number(request.body.amountCents);
  const reason = String(request.body.reason || "").trim();
  if (!Number.isSafeInteger(amountCents) || amountCents === 0 || !reason) throw apiError("BALANCE_ADJUSTMENT_INVALID", "请输入非零金额和调整原因");
  const result = await transaction(async (connection) => {
    await connection.query("INSERT IGNORE INTO v2_balance_account (anchor_id, balance_cents) VALUES (?, 0)", [anchorId]);
    const [accounts] = await connection.query("SELECT balance_cents FROM v2_balance_account WHERE anchor_id=? FOR UPDATE", [anchorId]);
    if (!accounts.length) throw apiError("ANCHOR_NOT_FOUND", "主播不存在", 404);
    const nextBalance = Number(accounts[0].balance_cents) + amountCents;
    const flowId = randomId("flow");
    await connection.query("UPDATE v2_balance_account SET balance_cents=? WHERE anchor_id=?", [nextBalance, anchorId]);
    await connection.query(
      "INSERT INTO v2_balance_flow (flow_id, anchor_id, direction, amount_cents, balance_after_cents, flow_type, reference_id, reason) VALUES (?, ?, ?, ?, ?, 'MANUAL_ADJUSTMENT', ?, ?)",
      [flowId, anchorId, amountCents > 0 ? "IN" : "OUT", Math.abs(amountCents), nextBalance, flowId, reason],
    );
    await audit({ connection, actorType: "ADMIN", actorId: request.admin.accountId, action: "BALANCE_MANUAL_ADJUST", targetType: "ANCHOR", targetId: anchorId, detail: { amountCents, balanceAfterCents: nextBalance, reason }, request });
    return { flowId, anchorId, balanceCents: nextBalance };
  });
  ok(response, result);
}));

app.get("/api/admin/v2/payment-requests", requireAdmin, asyncRoute(async (request, response) => {
  const status = String(request.query.status || "PENDING_REVIEW");
  const [rows] = await pool.query(
    `SELECT p.*, a.bixin_user_id, a.display_name
     FROM v2_payment_request p JOIN v2_anchor a ON a.anchor_id=p.anchor_id
     WHERE (?='ALL' OR p.review_status=?) ORDER BY p.created_at DESC LIMIT 500`,
    [status, status],
  );
  await audit({ actorType: "ADMIN", actorId: request.admin.accountId, action: "PAYMENT_INFO_FULL_VIEW", targetType: "PAYMENT_REQUEST_LIST", targetId: status, detail: { rowCount: rows.length }, request });
  ok(response, rows);
}));

app.post("/api/admin/v2/payment-requests/:requestId/review", requireAdmin, asyncRoute(async (request, response) => {
  const requestId = String(request.params.requestId || "");
  const decision = String(request.body.decision || "");
  const reason = String(request.body.reason || "").trim();
  if (!['APPROVED', 'REJECTED'].includes(decision)) throw apiError("PAYMENT_REVIEW_INVALID", "审核结果无效");
  await transaction(async (connection) => {
    const [rows] = await connection.query("SELECT * FROM v2_payment_request WHERE request_id=? AND review_status='PENDING_REVIEW' FOR UPDATE", [requestId]);
    if (!rows.length) throw apiError("PAYMENT_REQUEST_NOT_PENDING", "该申请已处理", 409);
    await connection.query("UPDATE v2_payment_request SET review_status=?, review_reason=?, reviewed_at=NOW(3), reviewed_by=? WHERE request_id=?", [decision, reason, request.admin.accountId, requestId]);
    await audit({ connection, actorType: "ADMIN", actorId: request.admin.accountId, action: `PAYMENT_INFO_${decision}`, targetType: "PAYMENT_REQUEST", targetId: requestId, detail: { reason }, request });
  });
  ok(response, { requestId, reviewStatus: decision, reviewReason: reason });
}));

app.get("/api/admin/v2/withdrawals", requireAdmin, asyncRoute(async (request, response) => {
  const date = String(request.query.date || shanghaiParts().date);
  const [rows] = await pool.query(
    `SELECT w.*, a.bixin_user_id, a.display_name, p.real_name, p.id_card_no, p.payment_mobile, p.bank_card_no
     FROM v2_withdraw_apply w JOIN v2_anchor a ON a.anchor_id=w.anchor_id
     LEFT JOIN v2_payment_request p ON p.request_id=(SELECT request_id FROM v2_payment_request WHERE anchor_id=w.anchor_id AND review_status='APPROVED' ORDER BY reviewed_at DESC LIMIT 1)
     WHERE w.business_date=? ORDER BY w.created_at ASC`,
    [date],
  );
  await audit({ actorType: "ADMIN", actorId: request.admin.accountId, action: "WITHDRAWAL_FULL_VIEW", targetType: "WITHDRAWAL_DATE", targetId: date, detail: { rowCount: rows.length }, request });
  ok(response, rows);
}));

app.post("/api/admin/v2/withdrawals/export", requireAdmin, asyncRoute(async (request, response) => {
  const date = String(request.body.businessDate || "");
  const today = shanghaiParts();
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) throw apiError("EXPORT_DATE_INVALID", "请选择提现日期");
  if (date === today.date && today.hour < 16) throw apiError("EXPORT_TOO_EARLY", "当天 16:00 后才能下载打款表");
  const [existing] = await pool.query("SELECT * FROM v2_payout_export WHERE business_date=? LIMIT 1", [date]);
  let rows = [];
  let files = [];
  const exportId = existing[0]?.export_id || randomId("exp");
  if (existing.length) {
    const [storedFiles] = await pool.query("SELECT part_no, file_name, file_blob FROM v2_payout_export_file WHERE export_id=? ORDER BY part_no", [exportId]);
    files = storedFiles.map((file) => ({ fileName: file.file_name, buffer: Buffer.from(file.file_blob) }));
    if (!files.length) throw apiError("EXPORT_FILE_MISSING", "原始打款表缺失，请联系技术处理", 500);
  } else {
    [rows] = await pool.query(
      `SELECT w.*, p.real_name, p.id_card_no, p.payment_mobile, p.bank_card_no
       FROM v2_withdraw_apply w
       JOIN v2_payment_request p ON p.request_id=(SELECT request_id FROM v2_payment_request WHERE anchor_id=w.anchor_id AND review_status='APPROVED' ORDER BY reviewed_at DESC LIMIT 1)
       WHERE w.business_date=? AND w.status='PENDING_PAYOUT' ORDER BY w.created_at ASC`,
      [date],
    );
    if (!rows.length) throw apiError("EXPORT_EMPTY", "该日期没有可导出的提现申请");
    files = await buildPayoutFiles({ businessDate: date, rows });
  }
  await transaction(async (connection) => {
    if (existing.length) {
      await connection.query("UPDATE v2_payout_export SET download_count=download_count+1, last_downloaded_at=NOW(3) WHERE export_id=?", [exportId]);
    } else {
      const aggregateHash = sha256(Buffer.concat(files.map((file) => file.buffer)));
      await connection.query(
        "INSERT INTO v2_payout_export (export_id, business_date, file_name, file_hash, row_count, total_amount_cents, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [exportId, date, files[0].fileName, aggregateHash, rows.length, rows.reduce((sum, row) => sum + Number(row.amount_cents), 0), request.admin.accountId],
      );
      for (let index = 0; index < files.length; index += 1) {
        await connection.query(
          "INSERT INTO v2_payout_export_file (export_id, part_no, file_name, file_hash, file_blob) VALUES (?, ?, ?, ?, ?)",
          [exportId, index + 1, files[index].fileName, sha256(files[index].buffer), files[index].buffer],
        );
      }
      await connection.query("UPDATE v2_withdraw_apply SET export_id=? WHERE business_date=? AND status='PENDING_PAYOUT'", [exportId, date]);
    }
    await audit({ connection, actorType: "ADMIN", actorId: request.admin.accountId, action: "PAYOUT_EXPORT_DOWNLOAD", targetType: "PAYOUT_EXPORT", targetId: exportId, detail: { businessDate: date, rowCount: Number(existing[0]?.row_count || rows.length), fileCount: files.length }, request });
  });
  ok(response, {
    exportId,
    files: files.map((file) => ({ fileName: file.fileName, contentBase64: file.buffer.toString("base64") })),
    rowCount: existing[0]?.row_count || rows.length,
    totalAmountCents: Number(existing[0]?.total_amount_cents || rows.reduce((sum, row) => sum + Number(row.amount_cents), 0)),
  });
}));

app.post("/api/admin/v2/withdrawals/:applyId/reject", requireAdmin, asyncRoute(async (request, response) => {
  const applyId = String(request.params.applyId || "");
  const reason = String(request.body.reason || "").trim().slice(0, 500);
  const result = await transaction(async (connection) => {
    const [rows] = await connection.query("SELECT * FROM v2_withdraw_apply WHERE apply_id=? FOR UPDATE", [applyId]);
    const apply = rows[0];
    if (!apply) throw apiError("WITHDRAW_APPLY_NOT_FOUND", "提现记录不存在", 404);
    if (apply.status !== "PENDING_PAYOUT" || !apply.export_id) throw apiError("WITHDRAW_NOT_EXPORTED_PENDING", "只有已导出的待打款记录可以驳回", 409);
    const [accounts] = await connection.query("SELECT balance_cents FROM v2_balance_account WHERE anchor_id=? FOR UPDATE", [apply.anchor_id]);
    const nextBalance = Number(accounts[0]?.balance_cents || 0) + Number(apply.amount_cents);
    await connection.query("UPDATE v2_balance_account SET balance_cents=? WHERE anchor_id=?", [nextBalance, apply.anchor_id]);
    await connection.query("UPDATE v2_withdraw_apply SET status='REJECTED', reject_reason=?, resolved_at=NOW(3), resolved_by=? WHERE apply_id=?", [reason, request.admin.accountId, applyId]);
    await connection.query(
      "INSERT INTO v2_balance_flow (flow_id, anchor_id, direction, amount_cents, balance_after_cents, flow_type, reference_id, reason) VALUES (?, ?, 'IN', ?, ?, 'WITHDRAW_REJECT', ?, ?)",
      [randomId("flow"), apply.anchor_id, apply.amount_cents, nextBalance, applyId, reason],
    );
    await audit({ connection, actorType: "ADMIN", actorId: request.admin.accountId, action: "WITHDRAW_REJECT", targetType: "WITHDRAW", targetId: applyId, detail: { amountCents: Number(apply.amount_cents), reason, balanceAfterCents: nextBalance }, request });
    return { applyId, status: "REJECTED", restoredCents: Number(apply.amount_cents), balanceCents: nextBalance };
  });
  ok(response, result);
}));

app.post("/api/admin/v2/withdrawals/all-success", requireAdmin, asyncRoute(async (request, response) => {
  const date = String(request.body.businessDate || "");
  const result = await transaction(async (connection) => {
    const [exports] = await connection.query("SELECT export_id FROM v2_payout_export WHERE business_date=? FOR UPDATE", [date]);
    if (!exports.length) throw apiError("PAYOUT_EXPORT_REQUIRED", "必须先下载该日期的打款表", 409);
    const [rows] = await connection.query("SELECT apply_id, amount_cents FROM v2_withdraw_apply WHERE business_date=? AND status='PENDING_PAYOUT' AND export_id=? FOR UPDATE", [date, exports[0].export_id]);
    if (!rows.length) throw apiError("WITHDRAW_SUCCESS_EMPTY", "没有剩余待成功记录", 409);
    await connection.query("UPDATE v2_withdraw_apply SET status='SUCCESS', resolved_at=NOW(3), resolved_by=? WHERE business_date=? AND status='PENDING_PAYOUT' AND export_id=?", [request.admin.accountId, date, exports[0].export_id]);
    const totalAmountCents = rows.reduce((sum, row) => sum + Number(row.amount_cents), 0);
    await audit({ connection, actorType: "ADMIN", actorId: request.admin.accountId, action: "WITHDRAW_ALL_SUCCESS", targetType: "WITHDRAWAL_DATE", targetId: date, detail: { count: rows.length, totalAmountCents }, request });
    return { businessDate: date, count: rows.length, totalAmountCents };
  });
  ok(response, result);
}));

app.get("/api/admin/v2/admin-accounts", requireAdmin, asyncRoute(async (request, response) => {
  const [rows] = await pool.query("SELECT account_id, username, status, created_at, updated_at FROM v2_admin_account ORDER BY created_at");
  ok(response, rows);
}));

app.post("/api/admin/v2/admin-accounts", requireAdmin, asyncRoute(async (request, response) => {
  const username = String(request.body.username || "").trim();
  const password = String(request.body.password || "");
  if (!username || password.length < 8) throw apiError("ADMIN_ACCOUNT_INVALID", "请输入账号和至少 8 位密码");
  const accountId = randomId("adm");
  await pool.query("INSERT INTO v2_admin_account (account_id, username, password_hash) VALUES (?, ?, ?)", [accountId, username, await hashPassword(password)]);
  await audit({ actorType: "ADMIN", actorId: request.admin.accountId, action: "ADMIN_ACCOUNT_CREATE", targetType: "ADMIN_ACCOUNT", targetId: accountId, detail: { username }, request });
  ok(response, { accountId, username, status: "ACTIVE" }, 201);
}));

app.patch("/api/admin/v2/admin-accounts/:accountId", requireAdmin, asyncRoute(async (request, response) => {
  const accountId = String(request.params.accountId || "");
  const status = String(request.body.status || "");
  if (!['ACTIVE', 'DISABLED'].includes(status)) throw apiError("ADMIN_STATUS_INVALID", "账号状态无效");
  if (accountId === request.admin.accountId && status === "DISABLED") throw apiError("ADMIN_SELF_DISABLE_BLOCKED", "不能停用当前登录账号", 409);
  await pool.query("UPDATE v2_admin_account SET status=? WHERE account_id=?", [status, accountId]);
  await audit({ actorType: "ADMIN", actorId: request.admin.accountId, action: "ADMIN_ACCOUNT_STATUS", targetType: "ADMIN_ACCOUNT", targetId: accountId, detail: { status }, request });
  ok(response, { accountId, status });
}));

app.get("/api/admin/v2/audit", requireAdmin, asyncRoute(async (request, response) => {
  const [rows] = await pool.query("SELECT audit_id, actor_type, actor_id, action, target_type, target_id, detail_json, ip_address, created_at FROM v2_audit_log ORDER BY audit_id DESC LIMIT 500");
  ok(response, rows);
}));

// Current miniapp compatibility API.
app.post("/api/miniapp/auth/wechat-login", asyncRoute(async (request, response) => {
  const jsCode = String(request.body.jsCode || "").trim();
  if (!jsCode) throw apiError("WECHAT_CODE_REQUIRED", "微信登录凭证缺失");
  const appId = await resolveSecret("MINIAPP_WECHAT_APP_ID", "MINIAPP_WECHAT_APP_ID_REF");
  const secret = await resolveSecret("MINIAPP_WECHAT_APP_SECRET", "MINIAPP_WECHAT_APP_SECRET_REF");
  if (!appId || !secret) throw apiError("WECHAT_CONFIG_MISSING", "微信登录配置缺失", 503);
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", secret);
  url.searchParams.set("js_code", jsCode);
  url.searchParams.set("grant_type", "authorization_code");
  const providerResponse = await fetch(url);
  const payload = await providerResponse.json();
  if (!payload.openid) throw apiError("WECHAT_LOGIN_FAILED", "微信登录失败", 401);
  const [anchors] = await pool.query("SELECT anchor_id FROM v2_anchor WHERE wechat_openid=? AND status='ACTIVE' LIMIT 1", [payload.openid]);
  if (anchors.length) return ok(response, await issueMiniappSession(anchors[0].anchor_id));
  const token = randomId("wbt");
  await pool.query("INSERT INTO v2_wechat_bind_token (token_hash, openid, expires_at) VALUES (?, ?, DATE_ADD(NOW(3), INTERVAL 30 MINUTE))", [sha256(token), payload.openid]);
  ok(response, { bindingRequired: true, wechatBindToken: token });
}));

async function resolveSecret(valueKey, refKey) {
  if (process.env[valueKey]) return process.env[valueKey];
  if (!process.env[refKey]) return "";
  return (await fs.readFile(process.env[refKey], "utf8")).trim();
}

app.post("/api/miniapp/anchor-registration-requests", asyncRoute(async (request, response) => {
  let bixinUserId;
  try {
    bixinUserId = normalizeBixinId(request.body.anchorId);
  } catch (error) {
    throw apiError("BIXIN_ID_INVALID", error.message, 400);
  }
  const displayName = String(request.body.displayName || "").trim();
  const mobile = String(request.body.mobile || "").trim();
  if (!displayName || !mobile) throw apiError("REGISTRATION_FIELDS_REQUIRED", "请填写姓名和手机号");
  const result = await transaction(async (connection) => {
    const [eligible] = await connection.query("SELECT bixin_user_id FROM v2_eligibility WHERE bixin_user_id=?", [bixinUserId]);
    if (!eligible.length) throw apiError("BIXIN_ID_NOT_ELIGIBLE", "该比心用户 ID 尚未出现在日数据中", 403);
    const existing = await findAnchorByBixinId(connection, bixinUserId);
    if (existing) throw apiError("BIXIN_ID_ALREADY_BOUND", "该比心用户 ID 已绑定", 409);
    const anchorId = bixinUserId;
    let openid = null;
    const bindToken = String(request.body.wechatBindToken || "");
    if (bindToken) {
      const [tokens] = await connection.query("SELECT openid FROM v2_wechat_bind_token WHERE token_hash=? AND expires_at>NOW(3) FOR UPDATE", [sha256(bindToken)]);
      openid = tokens[0]?.openid || null;
      if (!openid) throw apiError("WECHAT_BIND_TOKEN_INVALID", "微信绑定已失效，请重新登录", 401);
    }
    await connection.query("INSERT INTO v2_anchor (anchor_id, bixin_user_id, display_name, mobile, wechat_openid) VALUES (?, ?, ?, ?, ?)", [anchorId, bixinUserId, displayName, mobile, openid]);
    await connection.query("INSERT INTO v2_anchor_bixin_alias (bixin_user_id, anchor_id, is_primary) VALUES (?, ?, TRUE)", [bixinUserId, anchorId]);
    const registrationId = randomId("reg");
    await connection.query("INSERT INTO v2_registration_request (registration_id, bixin_user_id, anchor_id, display_name, mobile, review_status) VALUES (?, ?, ?, ?, ?, 'APPROVED')", [registrationId, bixinUserId, anchorId, displayName, mobile]);
    if (bindToken) await connection.query("DELETE FROM v2_wechat_bind_token WHERE token_hash=?", [sha256(bindToken)]);
    const creditedCents = await postPendingIncomeForAnchor(connection, anchorId, bixinUserId);
    await audit({ connection, actorType: "ANCHOR", actorId: anchorId, action: "ANCHOR_AUTO_REGISTER", targetType: "ANCHOR", targetId: anchorId, detail: { bixinUserId, creditedCents }, request });
    return { registrationId, anchorId, bixinUserId, displayName, mobile, reviewStatus: "APPROVED", creditedCents };
  });
  ok(response, result, 201);
}));

app.get("/api/miniapp/anchor-registration-requests", asyncRoute(async (request, response) => {
  const id = String(request.query.anchorId || "").trim();
  const mobile = String(request.query.mobile || "").trim();
  if (!id && !mobile) throw apiError("REGISTRATION_QUERY_REQUIRED", "请输入主播 ID 或手机号", 400);
  const [rows] = await pool.query(
    "SELECT registration_id AS registrationId, anchor_id AS anchorId, display_name AS displayName, mobile, review_status AS reviewStatus, created_at AS createdAt FROM v2_registration_request WHERE (?='' OR anchor_id=?) AND (?='' OR mobile=?) ORDER BY created_at",
    [id, id, mobile, mobile],
  );
  ok(response, rows);
}));

app.post("/api/miniapp/auth/login", asyncRoute(async (request, response) => {
  const loginAccount = String(request.body.loginAccount || "").trim();
  const [rows] = await pool.query("SELECT anchor_id, password_hash FROM v2_anchor WHERE (mobile=? OR anchor_id=? OR legacy_login_account=?) AND status='ACTIVE' LIMIT 1", [loginAccount, loginAccount, loginAccount]);
  const anchor = rows[0];
  if (!anchor || !anchor.password_hash || !await verifyPassword(String(request.body.password || ""), anchor.password_hash)) throw apiError("LOGIN_FAILED", "账号或密码错误", 401);
  ok(response, await issueMiniappSession(anchor.anchor_id));
}));

app.post("/api/miniapp/auth/wechat-bind", requireMiniapp, asyncRoute(async (request, response) => {
  const token = String(request.body.wechatBindToken || "");
  const [rows] = await pool.query("SELECT openid FROM v2_wechat_bind_token WHERE token_hash=? AND expires_at>NOW(3)", [sha256(token)]);
  if (!rows.length) throw apiError("WECHAT_BIND_TOKEN_INVALID", "微信绑定已失效", 401);
  await pool.query("UPDATE v2_anchor SET wechat_openid=? WHERE anchor_id=?", [rows[0].openid, request.anchor.anchorId]);
  await pool.query("DELETE FROM v2_wechat_bind_token WHERE token_hash=?", [sha256(token)]);
  ok(response, { bindingStatus: "BOUND" });
}));

app.post("/api/miniapp/auth/logout", requireMiniapp, asyncRoute(async (request, response) => {
  const token = String(request.headers["x-miniapp-token"] || "");
  await pool.query("DELETE FROM v2_miniapp_session WHERE token_hash=?", [sha256(token)]);
  ok(response, { loggedOut: true });
}));

app.get("/api/miniapp/home", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const today = shanghaiParts().date;
  const [balance, payment, sign, income] = await Promise.all([
    pool.query("SELECT balance_cents FROM v2_balance_account WHERE anchor_id=?", [anchorId]),
    pool.query("SELECT review_status, real_name, bank_card_no FROM v2_payment_request WHERE anchor_id=? ORDER BY created_at DESC LIMIT 1", [anchorId]),
    pool.query("SELECT sign_status FROM v2_yzh_contract WHERE anchor_id=?", [anchorId]),
    pool.query("SELECT COALESCE(SUM(r.amount_cents),0) AS amount_cents FROM v2_import_row r JOIN v2_import_batch b ON b.import_id=r.import_id AND b.status='ACTIVE' WHERE r.anchor_id=? AND b.business_date=?", [anchorId, today]),
  ]);
  ok(response, {
    anchorId,
    displayName: request.anchor.displayName,
    availableBalanceCents: Number(balance[0][0]?.balance_cents || 0),
    frozenBalanceCents: 0,
    rewardBalanceCents: 0,
    paymentInfoStatus: payment[0][0]?.review_status || "MISSING",
    paymentInfoSummary: payment[0][0] ? { realNameMasked: maskName(payment[0][0].real_name), bankCardNoMasked: maskCard(payment[0][0].bank_card_no) } : {},
    signStatus: sign[0][0]?.sign_status || "UNSIGNED",
    unreadNotificationCount: 0,
    todayMetrics: { incomeCents: Number(income[0][0].amount_cents), validDurationMinutes: 0, validDays: 0, taskStatus: "READY" },
  });
}));

function maskName(value) {
  const text = String(value || "");
  return text.length <= 1 ? text : `${text[0]}${"*".repeat(Math.max(1, text.length - 1))}`;
}

function maskCard(value) {
  const text = String(value || "");
  return text.length > 4 ? `**** **** **** ${text.slice(-4)}` : text;
}

app.get("/api/miniapp/profile", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const [rows] = await pool.query("SELECT anchor_id AS anchorId, bixin_user_id AS bixinUserId, display_name AS displayName, mobile, status, created_at AS createdAt FROM v2_anchor WHERE anchor_id=?", [anchorId]);
  ok(response, rows[0]);
}));

app.get("/api/miniapp/payment-info", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const [rows] = await pool.query("SELECT * FROM v2_payment_request WHERE anchor_id=? ORDER BY created_at DESC LIMIT 1", [anchorId]);
  const row = rows[0];
  if (!row) return ok(response, null);
  const [sign] = await pool.query("SELECT sign_status FROM v2_yzh_contract WHERE anchor_id=?", [anchorId]);
  ok(response, { paymentInfoId: row.request_id, paymentInfoStatus: row.review_status, realNameMasked: maskName(row.real_name), bankCardNoMasked: maskCard(row.bank_card_no), signStatus: sign[0]?.sign_status || "UNSIGNED" });
}));

async function createPaymentRequest(request, response, body = request.body) {
  const anchorId = request.anchor.anchorId;
  const fields = ["realName", "idCardNo", "paymentMobile", "bankCardNo"];
  if (fields.some((field) => !String(body[field] || "").trim())) throw apiError("PAYMENT_INFO_REQUIRED", "请完整填写收款信息");
  const requestId = randomId("payinfo");
  try {
    await pool.query(
      `INSERT INTO v2_payment_request
       (request_id, anchor_id, real_name, id_card_no, payment_mobile, bank_card_no, client_request_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [requestId, anchorId, body.realName, body.idCardNo, body.paymentMobile, body.bankCardNo, body.clientRequestId || null],
    );
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY" && body.clientRequestId) {
      const [rows] = await pool.query("SELECT * FROM v2_payment_request WHERE client_request_id=?", [body.clientRequestId]);
      return ok(response, { paymentInfoId: rows[0].request_id, paymentInfoStatus: rows[0].review_status });
    }
    throw error;
  }
  await audit({ actorType: "ANCHOR", actorId: anchorId, action: "PAYMENT_INFO_SUBMIT", targetType: "PAYMENT_REQUEST", targetId: requestId, request });
  ok(response, { paymentInfoId: requestId, paymentInfoStatus: "PENDING_REVIEW" }, 201);
}

app.post("/api/miniapp/payment-info", requireMiniapp, asyncRoute(async (request, response) => {
  assertOwnAnchor(request);
  return createPaymentRequest(request, response);
}));

app.get("/api/miniapp/payment-info/change-requests", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const [rows] = await pool.query("SELECT request_id AS changeRequestId, review_status AS reviewStatus, created_at AS createdAt, FALSE AS requireResign FROM v2_payment_request WHERE anchor_id=? ORDER BY created_at DESC", [anchorId]);
  ok(response, rows);
}));

app.post("/api/miniapp/payment-info/change-requests", requireMiniapp, asyncRoute(async (request, response) => {
  assertOwnAnchor(request);
  return createPaymentRequest(request, response, { ...request.body.patch, clientRequestId: request.body.clientRequestId });
}));

app.get("/api/miniapp/yzh/sign-status", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const [rows] = await pool.query("SELECT sign_status AS signStatus, presign_url AS signUrl, updated_at AS updatedAt FROM v2_yzh_contract WHERE anchor_id=?", [anchorId]);
  ok(response, rows[0] || { anchorId, signStatus: "UNSIGNED" });
}));

app.post("/api/miniapp/yzh/presign", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const [payment] = await pool.query("SELECT * FROM v2_payment_request WHERE anchor_id=? AND review_status='APPROVED' ORDER BY reviewed_at DESC LIMIT 1", [anchorId]);
  if (!payment.length) throw apiError("PAYMENT_INFO_REQUIRED", "收款信息审核通过后才能签约", 409);
  if (String(request.body.realName || "").trim() !== payment[0].real_name || String(request.body.idCardNo || "").trim().toUpperCase() !== payment[0].id_card_no.trim().toUpperCase()) {
    throw apiError("YZH_SIGN_IDENTITY_MISMATCH", "签约身份与已审核收款信息不一致", 409);
  }
  const result = await createYzhPresign({ realName: payment[0].real_name, idCardNo: payment[0].id_card_no, returnUrl: request.body.returnUrl });
  const status = result.status === "SIGNED" || result.status === "RELEASED" ? result.status : "SIGNING";
  await pool.query(
    "INSERT INTO v2_yzh_contract (anchor_id, sign_status, presign_url) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE sign_status=VALUES(sign_status), presign_url=VALUES(presign_url)",
    [anchorId, status, result.signUrl],
  );
  await audit({ actorType: "ANCHOR", actorId: anchorId, action: "YZH_PRESIGN_CREATE", targetType: "YZH_CONTRACT", targetId: anchorId, detail: { status }, request });
  ok(response, { anchorId, signStatus: status, signUrl: result.signUrl, assistantAppId: result.assistantAppId, miniProgramPath: result.miniProgramPath });
}));

app.post("/api/miniapp/yzh/refresh", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const [rows] = await pool.query("SELECT sign_status AS signStatus, updated_at AS updatedAt FROM v2_yzh_contract WHERE anchor_id=?", [anchorId]);
  ok(response, rows[0] || { anchorId, signStatus: "UNSIGNED" });
}));

app.post("/api/callback/yzh/sign", asyncRoute(async (request, response) => {
  const config = resolveYzhConfig();
  const payload = decodeYzhCallback(request.body, config);
  if (config.dealerId && payload.dealer_id && String(payload.dealer_id) !== config.dealerId) throw apiError("YZH_DEALER_ID_MISMATCH", "云账户回调商户号不一致", 403);
  if (config.brokerId && payload.broker_id && String(payload.broker_id) !== config.brokerId) throw apiError("YZH_BROKER_ID_MISMATCH", "云账户回调经纪公司编号不一致", 403);
  const [payments] = await pool.query(
    "SELECT anchor_id FROM v2_payment_request WHERE real_name=? AND UPPER(id_card_no)=UPPER(?) AND review_status='APPROVED' ORDER BY reviewed_at DESC LIMIT 2",
    [String(payload.real_name || "").trim(), String(payload.id_card || "").trim()],
  );
  const anchorId = payments.length === 1 ? payments[0].anchor_id : null;
  const signStatus = mapYzhSignStatus(payload.status);
  const requestId = String(request.headers["request-id"] || request.headers["x-request-id"] || "");
  const callbackKey = sha256(`${requestId}:${request.body.data}:${request.body.timestamp}:${payload.event_type || "SIGN_CALLBACK"}`);
  await transaction(async (connection) => {
    await connection.query(
      "INSERT IGNORE INTO v2_yzh_callback (callback_key, anchor_id, request_id, event_type, sign_status, masked_detail_json) VALUES (?, ?, ?, ?, ?, ?)",
      [callbackKey, anchorId, requestId, payload.event_type || "SIGN_CALLBACK", signStatus, JSON.stringify(maskYzhIdentity(payload))],
    );
    if (anchorId) {
      await connection.query(
        "INSERT INTO v2_yzh_contract (anchor_id, sign_status) VALUES (?, ?) ON DUPLICATE KEY UPDATE sign_status=VALUES(sign_status)",
        [anchorId, signStatus],
      );
    }
    await audit({ connection, actorType: "SYSTEM", actorId: "YZH_CALLBACK", action: "YZH_SIGN_CALLBACK", targetType: "YZH_CONTRACT", targetId: anchorId || "UNMATCHED", detail: { signStatus, requestId, matched: Boolean(anchorId) }, request });
  });
  response.type("text/plain").status(200).send("success");
}));

app.get("/api/miniapp/protocols", requireMiniapp, asyncRoute(async (request, response) => {
  assertOwnAnchor(request);
  ok(response, [
    { protocolType: "USER_SERVICE", versionNo: "v2.0", title: "用户服务协议", content: "嘉音提现服务协议" },
    { protocolType: "PRIVACY", versionNo: "v2.0", title: "隐私政策", content: "嘉音提现隐私政策" },
  ]);
}));

app.post("/api/miniapp/protocols/agree", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  await pool.query("INSERT IGNORE INTO v2_protocol_agreement (anchor_id, protocol_type, version_no) VALUES (?, ?, ?)", [anchorId, request.body.protocolType, request.body.versionNo]);
  ok(response, { protocolStatus: "AGREED" });
}));

app.get("/api/miniapp/contact", (request, response) => ok(response, { companyName: "嘉音文化", customerServiceText: "请联系公司运营人员" }));
app.get("/api/miniapp/legacy-history", requireMiniapp, asyncRoute(async (request, response) => { assertOwnAnchor(request); ok(response, []); }));
app.get("/api/miniapp/platform-accounts", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  ok(response, [{ platform: "bixin", accountNo: request.anchor.bixinUserId, anchorId, bindingStatus: "BOUND" }]);
}));
app.post("/api/miniapp/platform-bind-requests", requireMiniapp, asyncRoute(async (request, response) => { assertOwnAnchor(request); throw apiError("PLATFORM_BIND_FIXED", "比心 ID 已在注册时固定绑定", 409); }));

app.get("/api/miniapp/data", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const month = String(request.query.month || shanghaiParts().date.slice(0, 7));
  const [rows] = await pool.query(
    `SELECT b.business_date AS businessDate, r.star_value AS totalStar, r.amount_cents AS incomeCents,
            r.nickname, 'bixin' AS platform, 'READY' AS taskStatus
     FROM v2_import_row r JOIN v2_import_batch b ON b.import_id=r.import_id AND b.status='ACTIVE'
     WHERE r.anchor_id=? AND DATE_FORMAT(b.business_date,'%Y-%m')=? ORDER BY b.business_date DESC`,
    [anchorId, month],
  );
  ok(response, rows);
}));

app.get("/api/miniapp/balance-flows", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const page = Math.max(1, Number(request.query.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(request.query.pageSize || 20)));
  const [rows] = await pool.query(
    "SELECT flow_id AS flowId, direction, amount_cents AS amountCents, balance_after_cents AS balanceAfterCents, flow_type AS flowType, reason, 'POSTED' AS status, created_at AS createdAt FROM v2_balance_flow WHERE anchor_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?",
    [anchorId, pageSize, (page - 1) * pageSize],
  );
  ok(response, rows);
}));
app.get("/api/miniapp/task-rewards", requireMiniapp, asyncRoute(async (request, response) => { assertOwnAnchor(request); ok(response, []); }));

app.get("/api/miniapp/withdraw-rules", requireMiniapp, asyncRoute(async (request, response) => {
  const window = await currentWithdrawWindow();
  ok(response, {
    serverTime: new Date().toISOString(),
    serverDate: window.businessDate,
    minAmountCents: MIN_WITHDRAW_CENTS,
    maxAmountCents: null,
    submitWindowOpen: window.isOpen,
    submitWindowStatusText: window.isOpen ? "提现开放中" : "当前不可提现",
    submitWindowCountdownText: "北京时间 08:00–16:00",
    submitWindowTone: window.isOpen ? "success" : "warning",
    snapshot: { amountRangeText: "最低 100 元，最高不超过可用余额", feeText: "不收手续费", frozenText: "提交时直接扣减余额", auditText: "每次提现均记录流水", exceptionText: "驳回后下一个开放日可重新申请", windowText: "北京时间 08:00–16:00", arrivalText: "线下统一打款" },
    summaryItems: ["最低 100 元", "不收手续费", "同日可多次提交"],
  });
}));

function miniappWithdrawView(row) {
  const outwardStatus = row.status === "PENDING_PAYOUT" ? "WAIT_PAY" : row.status === "SUCCESS" ? "PAID" : "REJECTED";
  return { applyId: row.apply_id, anchorId: row.anchor_id, amountCents: Number(row.amount_cents), status: outwardStatus, statusText: outwardStatus, clientRequestId: row.client_request_id, rejectReason: row.reject_reason || "", createdAt: iso(row.created_at), resolvedAt: iso(row.resolved_at) };
}

app.get("/api/miniapp/withdraw-applies", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const [rows] = await pool.query("SELECT * FROM v2_withdraw_apply WHERE anchor_id=? ORDER BY created_at DESC", [anchorId]);
  ok(response, rows.map(miniappWithdrawView));
}));

app.get("/api/miniapp/withdraw-applies/:applyId", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const [rows] = await pool.query("SELECT * FROM v2_withdraw_apply WHERE apply_id=? AND anchor_id=?", [request.params.applyId, anchorId]);
  if (!rows.length) throw apiError("WITHDRAW_APPLY_NOT_FOUND", "提现记录不存在", 404);
  ok(response, { ...miniappWithdrawView(rows[0]), progressStep: rows[0].status === "PENDING_PAYOUT" ? 5 : 6 });
}));

app.post("/api/miniapp/withdraw-applies", requireMiniapp, asyncRoute(async (request, response) => {
  const anchorId = assertOwnAnchor(request);
  const amountCents = Number(request.body.amountCents);
  const clientRequestId = String(request.body.clientRequestId || "");
  if (!Number.isSafeInteger(amountCents) || amountCents < MIN_WITHDRAW_CENTS) throw apiError("MINIAPP_WITHDRAW_MIN_AMOUNT", "单笔提现最低 100 元");
  if (!clientRequestId) throw apiError("CLIENT_REQUEST_ID_REQUIRED", "请求标识缺失");
  const window = await currentWithdrawWindow();
  if (!window.isOpen) throw apiError("MINIAPP_WITHDRAW_WINDOW_CLOSED", "当前不在提现开放时间", 409, window);
  const result = await transaction(async (connection) => {
    const [existing] = await connection.query("SELECT * FROM v2_withdraw_apply WHERE client_request_id=?", [clientRequestId]);
    if (existing.length) return miniappWithdrawView(existing[0]);
    const [rejectedToday] = await connection.query("SELECT apply_id FROM v2_withdraw_apply WHERE anchor_id=? AND business_date=? AND status='REJECTED' LIMIT 1", [anchorId, window.businessDate]);
    if (rejectedToday.length) throw apiError("WITHDRAW_RETRY_SAME_DAY_BLOCKED", "驳回后请在下一个开放日重新提现", 409);
    const [payment] = await connection.query("SELECT request_id FROM v2_payment_request WHERE anchor_id=? AND review_status='APPROVED' ORDER BY reviewed_at DESC LIMIT 1", [anchorId]);
    if (!payment.length) throw apiError("PAYMENT_INFO_REQUIRED", "收款信息尚未审核通过", 409);
    const [sign] = await connection.query("SELECT sign_status FROM v2_yzh_contract WHERE anchor_id=?", [anchorId]);
    if (!sign.length || sign[0].sign_status !== "SIGNED") throw apiError("YZH_SIGN_REQUIRED", "请先完成云账户签约", 409);
    const [accounts] = await connection.query("SELECT balance_cents FROM v2_balance_account WHERE anchor_id=? FOR UPDATE", [anchorId]);
    const balance = Number(accounts[0]?.balance_cents || 0);
    if (balance < amountCents) throw apiError("INSUFFICIENT_BALANCE", "可用余额不足", 409);
    const nextBalance = balance - amountCents;
    const applyId = randomId("wd");
    await connection.query("UPDATE v2_balance_account SET balance_cents=? WHERE anchor_id=?", [nextBalance, anchorId]);
    await connection.query("INSERT INTO v2_withdraw_apply (apply_id, anchor_id, business_date, amount_cents, client_request_id) VALUES (?, ?, ?, ?, ?)", [applyId, anchorId, window.businessDate, amountCents, clientRequestId]);
    await connection.query(
      "INSERT INTO v2_balance_flow (flow_id, anchor_id, direction, amount_cents, balance_after_cents, flow_type, reference_id) VALUES (?, ?, 'OUT', ?, ?, 'WITHDRAW_SUBMIT', ?)",
      [randomId("flow"), anchorId, amountCents, nextBalance, applyId],
    );
    await audit({ connection, actorType: "ANCHOR", actorId: anchorId, action: "WITHDRAW_SUBMIT", targetType: "WITHDRAW", targetId: applyId, detail: { amountCents, businessDate: window.businessDate }, request });
    return { applyId, anchorId, amountCents, status: "WAIT_PAY", clientRequestId, createdAt: new Date().toISOString() };
  });
  ok(response, result, 201);
}));

app.get("/api/miniapp/notifications", requireMiniapp, asyncRoute(async (request, response) => { assertOwnAnchor(request); ok(response, []); }));
app.get("/api/miniapp/notifications/:notificationId", requireMiniapp, asyncRoute(async (request, response) => { assertOwnAnchor(request); throw apiError("NOTIFICATION_NOT_FOUND", "通知不存在", 404); }));
app.post("/api/miniapp/notifications/:notificationId/read", requireMiniapp, asyncRoute(async (request, response) => { assertOwnAnchor(request); ok(response, { read: true }); }));

app.use("/admin", express.static(adminDirectory, { index: "index.html", fallthrough: true }));
app.get("/admin/*path", (request, response) => response.sendFile(path.join(adminDirectory, "index.html")));

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  const status = Number(error.status || 500);
  if (status >= 500) console.error(error);
  response.status(status).json({
    ok: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: status >= 500 ? "服务暂时不可用" : error.message,
      userMessage: status >= 500 ? "服务暂时不可用，请稍后重试" : error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  });
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
const server = app.listen(port, host, () => console.log(JSON.stringify({ service: "jiayin-withdraw-v2", host, port })));
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.close(() => process.exit(0)));
