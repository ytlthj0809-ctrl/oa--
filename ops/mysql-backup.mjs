import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createGunzip, createGzip } from "node:zlib";
import mysql from "mysql2/promise";
import { readPrivateFile, storePrivateFile } from "../services/api/src/storage.mjs";

const BACKUP_ROOT = "/opt/withdraw-oa/backups/mysql-daily";
const DBA_ENV = "/opt/withdraw-oa/secrets/dba.env";
const RUNTIME_ENV = "/opt/withdraw-oa/secrets/runtime.env";
const LOCAL_RETENTION = 7;
const COUNT_TABLES = [
  "v2_anchor",
  "v2_balance_account",
  "v2_balance_flow",
  "v2_import_batch",
  "v2_import_row",
  "v2_payment_request",
  "v2_payout_export",
  "v2_payout_export_file",
  "v2_withdraw_apply",
];

function parseEnv(text) {
  const values = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^export\s+/, "");
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    values[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }
  return values;
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function writeDefaultsFile(directory, databaseUrl) {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (url.protocol !== "mysql:" || !/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error("MYSQL_DBA_URL 无效");
  }
  const defaultsPath = path.join(directory, "client.cnf");
  const quote = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  await fs.writeFile(
    defaultsPath,
    `[client]\nhost=${quote(url.hostname)}\nport=${url.port || 3306}\nuser=${quote(decodeURIComponent(url.username))}\npassword=${quote(decodeURIComponent(url.password))}\nprotocol=TCP\n`,
    { mode: 0o600, flag: "wx" },
  );
  return { defaultsPath, databaseName };
}

async function runCommandWithInput(command, args, readable) {
  const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"] });
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  const exit = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8") || `${command} 退出码 ${code}`));
    });
  });
  await Promise.all([pipeline(readable, child.stdin), exit]);
}

async function createDump({ defaultsPath, databaseName, archivePath }) {
  const child = spawn(
    "/usr/bin/mysqldump",
    [
      `--defaults-extra-file=${defaultsPath}`,
      "--single-transaction",
      "--quick",
      "--routines",
      "--events",
      "--hex-blob",
      "--set-gtid-purged=OFF",
      "--no-tablespaces",
      databaseName,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const stderr = [];
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  const exit = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(Buffer.concat(stderr).toString("utf8") || `mysqldump 退出码 ${code}`));
    });
  });
  await Promise.all([
    pipeline(child.stdout, createGzip({ level: 9 }), createWriteStream(archivePath, { flags: "wx", mode: 0o400 })),
    exit,
  ]);
}

async function collectCounts(connection, databaseName) {
  const [tables] = await connection.query(
    "SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE'",
    [databaseName],
  );
  const counts = {};
  for (const table of COUNT_TABLES) {
    const [rows] = await connection.query(
      `SELECT COUNT(*) AS count FROM \`${databaseName}\`.\`${table}\``,
    );
    counts[table] = Number(rows[0].count);
  }
  return { tableCount: Number(tables[0].count), counts };
}

async function retainLocalBackups() {
  const entries = await fs.readdir(BACKUP_ROOT, { withFileTypes: true });
  const completed = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^backup-\d{8}T\d{6}Z$/.test(entry.name)) continue;
    const manifestPath = path.join(BACKUP_ROOT, entry.name, "manifest.json");
    try {
      await fs.access(manifestPath);
      completed.push(entry.name);
    } catch {}
  }
  completed.sort().reverse();
  for (const name of completed.slice(LOCAL_RETENTION)) {
    await fs.rm(path.join(BACKUP_ROOT, name), { recursive: true, force: true });
  }
}

async function configureEnvironment() {
  const [runtimeText, dbaText] = await Promise.all([
    fs.readFile(RUNTIME_ENV, "utf8"),
    fs.readFile(DBA_ENV, "utf8"),
  ]);
  const runtime = parseEnv(runtimeText);
  Object.assign(process.env, runtime);
  const dba = parseEnv(dbaText);
  if (!dba.MYSQL_DBA_URL) throw new Error("MYSQL_DBA_URL 缺失");
  return dba.MYSQL_DBA_URL;
}

async function createBackup() {
  const databaseUrl = await configureEnvironment();
  const runStamp = stamp();
  const backupDirectory = path.join(BACKUP_ROOT, `backup-${runStamp}`);
  const temporaryDirectory = await fs.mkdtemp("/tmp/withdraw-mysql-backup-");
  await fs.mkdir(backupDirectory, { recursive: false, mode: 0o700 });
  const archiveName = `jiayin-oa-${runStamp}.sql.gz`;
  const archivePath = path.join(backupDirectory, archiveName);
  let connection;
  try {
    const { defaultsPath, databaseName } = await writeDefaultsFile(temporaryDirectory, databaseUrl);
    connection = await mysql.createConnection(databaseUrl);
    const source = await collectCounts(connection, databaseName);
    await createDump({ defaultsPath, databaseName, archivePath });
    const archiveHash = await sha256File(archivePath);
    const archiveSize = (await fs.stat(archivePath)).size;
    const objectKey = `v2/backups/mysql/${runStamp.slice(0, 8)}/${archiveName}`;
    const archiveBody = await fs.readFile(archivePath);
    await storePrivateFile({ key: objectKey, body: archiveBody, contentType: "application/gzip" });
    const remoteBuffer = await readPrivateFile({ key: objectKey });
    const remoteHash = crypto.createHash("sha256").update(remoteBuffer).digest("hex");
    if (remoteHash !== archiveHash) throw new Error("COS 备份哈希校验失败");
    const manifest = {
      status: "VERIFIED",
      createdAt: new Date().toISOString(),
      databaseName,
      archiveName,
      archiveSize,
      archiveSha256: archiveHash,
      objectKey,
      cosReadbackVerified: true,
      localRetention: LOCAL_RETENTION,
      source,
    };
    const manifestBody = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    await fs.writeFile(path.join(backupDirectory, "manifest.json"), manifestBody, { mode: 0o400, flag: "wx" });
    await storePrivateFile({ key: `${objectKey}.manifest.json`, body: manifestBody, contentType: "application/json" });
    await retainLocalBackups();
    console.log(JSON.stringify(manifest));
  } finally {
    await connection?.end();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function latestBackup() {
  const entries = (await fs.readdir(BACKUP_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^backup-\d{8}T\d{6}Z$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  for (const name of entries) {
    const directory = path.join(BACKUP_ROOT, name);
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(directory, "manifest.json"), "utf8"));
      return { directory, manifest, archivePath: path.join(directory, manifest.archiveName) };
    } catch {}
  }
  throw new Error("没有可用于恢复演练的完整备份");
}

async function restoreDrill() {
  const databaseUrl = await configureEnvironment();
  const { directory, manifest, archivePath } = await latestBackup();
  const drillStamp = stamp();
  const drillDatabase = `jiayin_restore_drill_${drillStamp.replace(/[^0-9]/g, "")}`;
  if (!/^jiayin_restore_drill_\d{14}$/.test(drillDatabase)) throw new Error("恢复演练数据库名无效");
  const temporaryDirectory = await fs.mkdtemp("/tmp/withdraw-mysql-restore-");
  let connection;
  let created = false;
  let report;
  try {
    const { defaultsPath } = await writeDefaultsFile(temporaryDirectory, databaseUrl);
    connection = await mysql.createConnection(databaseUrl);
    await connection.query(`CREATE DATABASE \`${drillDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    created = true;
    await runCommandWithInput(
      "/usr/bin/mysql",
      [`--defaults-extra-file=${defaultsPath}`, drillDatabase],
      createReadStream(archivePath).pipe(createGunzip()),
    );
    const restored = await collectCounts(connection, drillDatabase);
    if (JSON.stringify(restored) !== JSON.stringify(manifest.source)) {
      throw new Error("恢复后的表数量或关键行数与备份清单不一致");
    }
    report = {
      status: "VERIFIED",
      verifiedAt: new Date().toISOString(),
      sourceArchive: manifest.archiveName,
      sourceArchiveSha256: manifest.archiveSha256,
      restored,
      temporaryDatabaseDropped: false,
    };
  } finally {
    if (created && connection) {
      await connection.query(`DROP DATABASE \`${drillDatabase}\``);
      if (report) report.temporaryDatabaseDropped = true;
    }
    await connection?.end();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
  const reportBody = Buffer.from(`${JSON.stringify(report, null, 2)}\n`);
  const reportPath = path.join(directory, `restore-drill-${drillStamp}.json`);
  await fs.writeFile(reportPath, reportBody, { mode: 0o400, flag: "wx" });
  await storePrivateFile({
    key: `${manifest.objectKey}.restore-drill-${drillStamp}.json`,
    body: reportBody,
    contentType: "application/json",
  });
  console.log(JSON.stringify(report));
}

await fs.mkdir(BACKUP_ROOT, { recursive: true, mode: 0o700 });
const operation = process.argv[2];
if (operation === "backup") await createBackup();
else if (operation === "restore-drill") await restoreDrill();
else throw new Error("用法：node ops/mysql-backup.mjs backup|restore-drill");
