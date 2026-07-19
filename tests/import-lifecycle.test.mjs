import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { schemaStatements } from "../services/api/src/schema.mjs";

test("deleted daily files may be uploaded again while active duplicates remain blocked", async () => {
  const serverSource = await fs.readFile(
    new URL("../services/api/src/server.mjs", import.meta.url),
    "utf8",
  );
  const activeHashLookups = serverSource.match(
    /WHERE file_hash=\? AND status='ACTIVE' LIMIT 1/g,
  ) || [];
  assert.equal(activeHashLookups.length, 2);
  assert.doesNotMatch(
    serverSource,
    /WHERE file_hash=\? LIMIT 1/,
  );

  const importBatchSchema = schemaStatements.find((statement) =>
    statement.includes("CREATE TABLE IF NOT EXISTS v2_import_batch"),
  );
  assert.match(importBatchSchema, /INDEX idx_v2_import_file_hash \(file_hash\)/);
  assert.doesNotMatch(importBatchSchema, /file_hash CHAR\(64\) NOT NULL UNIQUE/);
});
